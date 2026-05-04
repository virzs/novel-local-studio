import { LibSQLVector } from '@mastra/libsql';
import { getDbUrl, getLibSqlClient } from './libsql.ts';

let _vector: LibSQLVector | null = null;

const NOVEL_INDEX = 'novel_content';

export function initVectorStore(): LibSQLVector {
  if (_vector) return _vector;
  _vector = new LibSQLVector({ id: 'novel-vector', url: getDbUrl() });
  return _vector;
}

export function getVectorStore(): LibSQLVector {
  if (!_vector) throw new Error('vector store not initialized');
  return _vector;
}

export async function ensureNovelIndex(dimension: number): Promise<void> {
  const v = getVectorStore();
  await v.createIndex({ indexName: NOVEL_INDEX, dimension });
}

export async function ensureOrRecreateNovelIndex(dimension: number): Promise<{
  recreated: boolean;
  previousDimension: number | null;
}> {
  const v = getVectorStore();
  let current: { dimension?: number } | null = null;
  try {
    current = (await v.describeIndex({ indexName: NOVEL_INDEX })) as { dimension?: number };
  } catch {
    current = null;
  }
  const previousDimension = current?.dimension ?? null;
  if (previousDimension === dimension) {
    await v.createIndex({ indexName: NOVEL_INDEX, dimension });
    return { recreated: false, previousDimension };
  }
  if (previousDimension !== null) {
    await v.deleteIndex({ indexName: NOVEL_INDEX });
  }
  await v.createIndex({ indexName: NOVEL_INDEX, dimension });
  const c = getLibSqlClient();
  await c.execute('DELETE FROM document_embedding_state');
  return { recreated: true, previousDimension };
}

export const VECTOR_INDEX_NAME = NOVEL_INDEX;
