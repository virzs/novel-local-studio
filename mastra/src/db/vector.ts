import { LibSQLVector } from '@mastra/libsql';
import { getDbUrl } from './libsql.ts';

let _vector: LibSQLVector | null = null;

const NOVEL_INDEX = 'novel_content';
const NOVEL_DIM = 1536;

export function initVectorStore(): LibSQLVector {
  if (_vector) return _vector;
  _vector = new LibSQLVector({ id: 'novel-vector', url: getDbUrl() });
  return _vector;
}

export function getVectorStore(): LibSQLVector {
  if (!_vector) throw new Error('vector store not initialized');
  return _vector;
}

export async function ensureNovelIndex(): Promise<void> {
  const v = getVectorStore();
  await v.createIndex({ indexName: NOVEL_INDEX, dimension: NOVEL_DIM });
}

export const VECTOR_INDEX_NAME = NOVEL_INDEX;
export const VECTOR_DIMENSION = NOVEL_DIM;
