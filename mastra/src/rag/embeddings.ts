import { embedMany, embed } from 'ai';
import { getLibSqlClient } from '../db/libsql.ts';
import { getVectorStore, VECTOR_INDEX_NAME } from '../db/vector.ts';
import { getDocument } from '../db/books.ts';
import type { DocumentRow } from '../db/books.ts';
import { registry } from '../llm/providers.ts';
import { getBindings } from '../agents/bindings-cache.ts';
import { chunkText } from './chunk.ts';

export type EmbedDocumentResult = {
  documentId: string;
  chunkCount: number;
  skipped: boolean;
  reason?: string;
};

async function readState(documentId: string): Promise<{
  contentUpdatedAt: number;
  providerId: string;
  model: string;
} | null> {
  const c = getLibSqlClient();
  const r = await c.execute({
    sql: 'SELECT content_updated_at, provider_id, model FROM document_embedding_state WHERE document_id = ?',
    args: [documentId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as unknown as {
    content_updated_at: number;
    provider_id: string;
    model: string;
  };
  return {
    contentUpdatedAt: Number(row.content_updated_at),
    providerId: row.provider_id,
    model: row.model,
  };
}

async function writeState(args: {
  documentId: string;
  contentUpdatedAt: number;
  chunkCount: number;
  providerId: string;
  model: string;
  dimension: number;
}): Promise<void> {
  const c = getLibSqlClient();
  await c.execute({
    sql: `INSERT INTO document_embedding_state
          (document_id, embedded_at, content_updated_at, chunk_count, provider_id, model, dimension)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(document_id) DO UPDATE SET
            embedded_at = excluded.embedded_at,
            content_updated_at = excluded.content_updated_at,
            chunk_count = excluded.chunk_count,
            provider_id = excluded.provider_id,
            model = excluded.model,
            dimension = excluded.dimension`,
    args: [
      args.documentId,
      Date.now(),
      args.contentUpdatedAt,
      args.chunkCount,
      args.providerId,
      args.model,
      args.dimension,
    ],
  });
}

async function deleteState(documentId: string): Promise<void> {
  const c = getLibSqlClient();
  await c.execute({
    sql: 'DELETE FROM document_embedding_state WHERE document_id = ?',
    args: [documentId],
  });
}

export async function deleteDocumentEmbeddings(documentId: string): Promise<void> {
  const v = getVectorStore();
  await v.deleteVectors({
    indexName: VECTOR_INDEX_NAME,
    filter: { documentId: { $eq: documentId } },
  });
  await deleteState(documentId);
}

async function embedRow(doc: DocumentRow, force: boolean): Promise<EmbedDocumentResult> {
  if (!doc.content || !doc.content.trim()) {
    await deleteDocumentEmbeddings(doc.id);
    return { documentId: doc.id, chunkCount: 0, skipped: true, reason: 'empty content' };
  }

  const bindings = getBindings();
  const embedBinding = bindings.embedding;
  const state = await readState(doc.id);
  const sameModel =
    state && state.providerId === embedBinding.providerId && state.model === embedBinding.model;
  if (!force && state && sameModel && state.contentUpdatedAt >= doc.updatedAt) {
    return { documentId: doc.id, chunkCount: 0, skipped: true, reason: 'up-to-date' };
  }

  const chunks = chunkText(doc.content);
  if (chunks.length === 0) {
    await deleteDocumentEmbeddings(doc.id);
    return { documentId: doc.id, chunkCount: 0, skipped: true, reason: 'no chunks' };
  }

  const model = registry.getEmbeddingModel(embedBinding);
  const { embeddings } = await embedMany({ model, values: chunks.map((c) => c.text) });

  const v = getVectorStore();
  await v.upsert({
    indexName: VECTOR_INDEX_NAME,
    vectors: embeddings,
    metadata: chunks.map((ch) => ({
      documentId: doc.id,
      bookId: doc.bookId,
      kind: doc.kind,
      title: doc.title,
      chunkIndex: ch.index,
      start: ch.start,
      end: ch.end,
      text: ch.text,
    })),
    deleteFilter: { documentId: { $eq: doc.id } },
  });

  await writeState({
    documentId: doc.id,
    contentUpdatedAt: doc.updatedAt,
    chunkCount: chunks.length,
    providerId: embedBinding.providerId,
    model: embedBinding.model,
    dimension: embedBinding.dimension,
  });

  return { documentId: doc.id, chunkCount: chunks.length, skipped: false };
}

export async function embedDocumentById(
  id: string,
  opts?: { force?: boolean },
): Promise<EmbedDocumentResult | null> {
  const doc = await getDocument(id);
  if (!doc) return null;
  return embedRow(doc, opts?.force ?? false);
}

export async function embedDocumentByIdSafe(id: string): Promise<void> {
  try {
    await embedDocumentById(id);
  } catch (e) {
    console.warn(`[embed] failed for doc ${id}:`, (e as Error).message);
  }
}

export async function backfillEmbeddings(): Promise<{
  embedded: number;
  skipped: number;
  failed: number;
}> {
  const c = getLibSqlClient();
  const r = await c.execute(
    `SELECT d.id FROM document d
     LEFT JOIN document_embedding_state s ON s.document_id = d.id
     WHERE d.status = 'active' AND d.content != '' AND (s.document_id IS NULL OR s.content_updated_at < d.updated_at)`,
  );
  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of r.rows) {
    const id = (row as unknown as { id: string }).id;
    try {
      const res = await embedDocumentById(id);
      if (res?.skipped) skipped++;
      else embedded++;
    } catch (e) {
      failed++;
      console.warn(`[backfill] doc ${id} failed:`, (e as Error).message);
    }
  }
  return { embedded, skipped, failed };
}

export async function embedQuery(query: string): Promise<number[]> {
  const model = registry.getEmbeddingModel(getBindings().embedding);
  const { embedding } = await embed({ model, value: query });
  return embedding;
}

export async function listEmbeddedDocuments(): Promise<
  Array<{ documentId: string; chunkCount: number; embeddedAt: number }>
> {
  const c = getLibSqlClient();
  const r = await c.execute(
    'SELECT document_id, chunk_count, embedded_at FROM document_embedding_state',
  );
  return r.rows.map((row) => {
    const x = row as unknown as {
      document_id: string;
      chunk_count: number;
      embedded_at: number;
    };
    return {
      documentId: x.document_id,
      chunkCount: Number(x.chunk_count),
      embeddedAt: Number(x.embedded_at),
    };
  });
}
