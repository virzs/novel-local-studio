import { createClient, type Client } from '@libsql/client';
import path from 'node:path';

let _client: Client | null = null;
let _dbPath: string | null = null;

export function initLibSqlClient(dataDir: string): Client {
  if (_client) return _client;
  _dbPath = path.join(dataDir, 'app.db');
  _client = createClient({ url: `file:${_dbPath}` });
  return _client;
}

export function getLibSqlClient(): Client {
  if (!_client) throw new Error('libsql client not initialized');
  return _client;
}

export function getDbPath(): string {
  if (!_dbPath) throw new Error('db path not initialized');
  return _dbPath;
}

export function getDbUrl(): string {
  return `file:${getDbPath()}`;
}

export async function runBusinessMigrations(): Promise<void> {
  const c = getLibSqlClient();
  await c.execute(`
    CREATE TABLE IF NOT EXISTS book (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      synopsis TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS document (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES document(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('folder','chapter','setting','outline','note')),
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await c.execute(`
    CREATE INDEX IF NOT EXISTS idx_document_book_parent
    ON document(book_id, parent_id, order_index)
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS document_embedding_state (
      document_id TEXT PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
      embedded_at INTEGER NOT NULL,
      content_updated_at INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL
    )
  `);

  const bookColumns = await c.execute('PRAGMA table_info(book)');
  const hasLineupId = bookColumns.rows.some((row) => row.name === 'lineup_id');
  if (!hasLineupId) {
    await c.execute('ALTER TABLE book ADD COLUMN lineup_id TEXT');
  }
}
