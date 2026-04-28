import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getFtsDb } from '../db/fts.ts';
import { getVectorStore, VECTOR_INDEX_NAME } from '../db/vector.ts';
import { embedQuery } from '../rag/embeddings.ts';
import { readBookIdFromContext } from '../shared/request-context.ts';

function escapeFts(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}

type FtsRow = {
  document_id: string;
  book_id: string;
  kind: string;
  title: string;
  snippet: string;
  score: number;
};

type Hit = {
  documentId: string;
  bookId: string;
  kind: string;
  title: string;
  snippet: string;
  source: 'fts' | 'vector' | 'hybrid';
  rrfScore: number;
};

function ftsSearch(query: string, bookId: string | undefined, limit: number): FtsRow[] {
  const db = getFtsDb();
  const where = bookId ? 'AND book_id = ?' : '';
  const sql = `
    SELECT document_id, book_id, kind, title,
           snippet(document_fts, 4, '<<', '>>', '...', 16) AS snippet,
           bm25(document_fts) AS score
    FROM document_fts
    WHERE document_fts MATCH ? ${where}
    ORDER BY score ASC
    LIMIT ?
  `;
  const args: unknown[] = [escapeFts(query)];
  if (bookId) args.push(bookId);
  args.push(limit);
  try {
    return db.prepare(sql).all(...args) as FtsRow[];
  } catch {
    return [];
  }
}

type VectorHit = {
  documentId: string;
  bookId: string;
  kind: string;
  title: string;
  text: string;
  similarity: number;
};

async function vectorSearch(
  query: string,
  bookId: string | undefined,
  limit: number,
): Promise<VectorHit[]> {
  let queryVector: number[];
  try {
    queryVector = await embedQuery(query);
  } catch {
    return [];
  }
  const v = getVectorStore();
  const filter = bookId ? { bookId: { $eq: bookId } } : undefined;
  const results = await v.query({
    indexName: VECTOR_INDEX_NAME,
    queryVector,
    topK: limit * 3,
    filter,
  });
  const bestPerDoc = new Map<string, VectorHit>();
  for (const r of results) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const documentId = String(meta.documentId ?? '');
    if (!documentId) continue;
    const hit: VectorHit = {
      documentId,
      bookId: String(meta.bookId ?? ''),
      kind: String(meta.kind ?? ''),
      title: String(meta.title ?? ''),
      text: String(meta.text ?? ''),
      similarity: r.score ?? 0,
    };
    const prev = bestPerDoc.get(documentId);
    if (!prev || hit.similarity > prev.similarity) bestPerDoc.set(documentId, hit);
  }
  return Array.from(bestPerDoc.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function rrfFuse(fts: FtsRow[], vec: VectorHit[], limit: number, k = 60): Hit[] {
  const map = new Map<string, Hit>();

  fts.forEach((row, i) => {
    const score = 1 / (k + i + 1);
    map.set(row.document_id, {
      documentId: row.document_id,
      bookId: row.book_id,
      kind: row.kind,
      title: row.title,
      snippet: row.snippet,
      source: 'fts',
      rrfScore: score,
    });
  });

  vec.forEach((hit, i) => {
    const score = 1 / (k + i + 1);
    const prev = map.get(hit.documentId);
    if (prev) {
      prev.rrfScore += score;
      prev.source = 'hybrid';
      if (!prev.snippet || prev.snippet.length < 20) prev.snippet = hit.text.slice(0, 160);
    } else {
      map.set(hit.documentId, {
        documentId: hit.documentId,
        bookId: hit.bookId,
        kind: hit.kind,
        title: hit.title,
        snippet: hit.text.slice(0, 160),
        source: 'vector',
        rrfScore: score,
      });
    }
  });

  return Array.from(map.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);
}

export const searchDocumentsTool = createTool({
  id: 'searchDocuments',
  description:
    '混合检索文档：同时执行 FTS5 关键词搜索（trigram，支持 3+ 字中文）和向量语义搜索（基于已嵌入的章节段落），用 Reciprocal Rank Fusion 融合结果。优先用语义匹配相关概念，关键词锁定确切词组。bookId 省略时默认锁定到用户当前选中的书；如需跨书检索请显式传 bookId="*"。',
  inputSchema: z.object({
    query: z.string().min(1),
    bookId: z.string().optional(),
    limit: z.number().int().positive().max(20).default(8),
    mode: z.enum(['hybrid', 'fts', 'vector']).default('hybrid'),
  }),
  execute: async ({ query, bookId, limit = 8, mode = 'hybrid' }, ctx) => {
    const activeBookId = readBookIdFromContext(ctx);
    const effectiveBookId =
      bookId === '*' ? undefined : (bookId ?? activeBookId);
    if (mode === 'fts') {
      const rows = ftsSearch(query, effectiveBookId, limit);
      return {
        mode: 'fts' as const,
        scopedBookId: effectiveBookId ?? null,
        hits: rows.map((r, i) => ({
          documentId: r.document_id,
          bookId: r.book_id,
          kind: r.kind,
          title: r.title,
          snippet: r.snippet,
          source: 'fts' as const,
          rrfScore: 1 / (60 + i + 1),
        })),
      };
    }
    if (mode === 'vector') {
      const vec = await vectorSearch(query, effectiveBookId, limit);
      return {
        mode: 'vector' as const,
        scopedBookId: effectiveBookId ?? null,
        hits: vec.map((h, i) => ({
          documentId: h.documentId,
          bookId: h.bookId,
          kind: h.kind,
          title: h.title,
          snippet: h.text.slice(0, 160),
          source: 'vector' as const,
          rrfScore: 1 / (60 + i + 1),
        })),
      };
    }
    const [fts, vec] = await Promise.all([
      Promise.resolve(ftsSearch(query, effectiveBookId, limit)),
      vectorSearch(query, effectiveBookId, limit),
    ]);
    return {
      mode: 'hybrid' as const,
      scopedBookId: effectiveBookId ?? null,
      hits: rrfFuse(fts, vec, limit),
    };
  },
});

export const searchTools = { searchDocuments: searchDocumentsTool };
