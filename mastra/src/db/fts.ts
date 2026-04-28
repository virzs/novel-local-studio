import Database from 'better-sqlite3';
import { getDbPath } from './libsql.ts';

let _db: Database.Database | null = null;

export function initFtsDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(getDbPath());
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
  return _db;
}

export function getFtsDb(): Database.Database {
  if (!_db) throw new Error('fts db not initialized');
  return _db;
}

export function setupFtsSchema(): void {
  const db = getFtsDb();
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
      document_id UNINDEXED,
      book_id UNINDEXED,
      kind UNINDEXED,
      title,
      content,
      tokenize = 'trigram'
    );

    CREATE TRIGGER IF NOT EXISTS document_ai AFTER INSERT ON document BEGIN
      INSERT INTO document_fts(document_id, book_id, kind, title, content)
      VALUES (new.id, new.book_id, new.kind, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS document_au AFTER UPDATE OF title, content ON document BEGIN
      UPDATE document_fts SET title = new.title, content = new.content WHERE document_id = new.id;
    END;

    CREATE TRIGGER IF NOT EXISTS document_ad AFTER DELETE ON document BEGIN
      DELETE FROM document_fts WHERE document_id = old.id;
    END;
  `);
}

export function backfillFts(): number {
  const db = getFtsDb();
  const existing = db.prepare('SELECT COUNT(*) AS n FROM document_fts').get() as { n: number };
  if (existing.n > 0) return 0;
  const rows = db
    .prepare('SELECT id, book_id, kind, title, content FROM document')
    .all() as Array<{ id: string; book_id: string; kind: string; title: string; content: string }>;
  const stmt = db.prepare(
    'INSERT INTO document_fts(document_id, book_id, kind, title, content) VALUES (?, ?, ?, ?, ?)',
  );
  const tx = db.transaction((items: typeof rows) => {
    for (const r of items) stmt.run(r.id, r.book_id, r.kind, r.title, r.content);
  });
  tx(rows);
  return rows.length;
}

export function closeFtsDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
