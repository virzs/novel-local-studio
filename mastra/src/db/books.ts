import { getLibSqlClient } from './libsql.ts';

type EmbedHooks = {
  onUpsert?: (id: string) => void;
  onDelete?: (id: string) => void;
};

let _hooks: EmbedHooks = {};

export function setEmbedHooks(hooks: EmbedHooks): void {
  _hooks = hooks;
}

export type DocumentKind = 'folder' | 'chapter' | 'setting' | 'outline' | 'note';

export type Book = {
  id: string;
  title: string;
  synopsis: string | null;
  status: string;
  lineupId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateBookInput = {
  title: string;
  synopsis?: string | null;
  status?: string;
  lineupId?: string | null;
};

export type UpdateBookInput = {
  title?: string;
  synopsis?: string | null;
  status?: string;
  lineupId?: string | null;
};

export type DocumentRow = {
  id: string;
  bookId: string;
  parentId: string | null;
  kind: DocumentKind;
  title: string;
  content: string;
  wordCount: number;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
};

export type DocumentNode = Omit<DocumentRow, 'content'> & {
  children: DocumentNode[];
};

export function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function countWords(s: string): number {
  return (s ?? '').replace(/\s+/g, '').length;
}

export type CreateDocumentInput = {
  bookId: string;
  parentId?: string | null;
  kind: DocumentKind;
  title: string;
  content?: string;
  orderIndex?: number;
};

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
  const c = getLibSqlClient();
  const id = rid('doc');
  const now = Date.now();
  const content = input.content ?? '';
  const wc = countWords(content);
  let order = input.orderIndex;
  if (order === undefined) {
    const r = await c.execute({
      sql: `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM document
            WHERE book_id = ? AND ((? IS NULL AND parent_id IS NULL) OR parent_id = ?)`,
      args: [input.bookId, input.parentId ?? null, input.parentId ?? null],
    });
    order = Number((r.rows[0] as unknown as { next: number }).next);
  }
  await c.execute({
    sql: `INSERT INTO document
          (id, book_id, parent_id, kind, title, content, word_count, order_index, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.bookId, input.parentId ?? null, input.kind, input.title, content, wc, order, now, now],
  });
  const doc = (await getDocument(id))!;
  if (content.trim()) _hooks.onUpsert?.(id);
  return doc;
}

export type UpdateDocumentInput = {
  id: string;
  title?: string;
  content?: string;
  parentId?: string | null;
  orderIndex?: number;
};

export async function updateDocument(input: UpdateDocumentInput): Promise<DocumentRow | null> {
  const c = getLibSqlClient();
  const cur = await getDocument(input.id);
  if (!cur) return null;
  const title = input.title ?? cur.title;
  const content = input.content ?? cur.content;
  const wc = countWords(content);
  const parentId = input.parentId !== undefined ? input.parentId : cur.parentId;
  const order = input.orderIndex !== undefined ? input.orderIndex : cur.orderIndex;
  const now = Date.now();
  await c.execute({
    sql: `UPDATE document
          SET title = ?, content = ?, word_count = ?, parent_id = ?, order_index = ?, updated_at = ?
          WHERE id = ?`,
    args: [title, content, wc, parentId, order, now, input.id],
  });
  const doc = await getDocument(input.id);
  if (doc && input.content !== undefined) _hooks.onUpsert?.(input.id);
  return doc;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const c = getLibSqlClient();
  const r = await c.execute({ sql: 'DELETE FROM document WHERE id = ?', args: [id] });
  const deleted = r.rowsAffected > 0;
  if (deleted) _hooks.onDelete?.(id);
  return deleted;
}

function rowToBook(r: Record<string, unknown>): Book {
  return {
    id: r.id as string,
    title: r.title as string,
    synopsis: (r.synopsis as string | null) ?? null,
    status: r.status as string,
    lineupId: (r.lineup_id as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function rowToDoc(r: Record<string, unknown>): DocumentRow {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    kind: r.kind as DocumentKind,
    title: r.title as string,
    content: (r.content as string) ?? '',
    wordCount: Number(r.word_count ?? 0),
    orderIndex: Number(r.order_index ?? 0),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export async function listBooks(): Promise<Book[]> {
  const c = getLibSqlClient();
  const r = await c.execute('SELECT * FROM book ORDER BY updated_at DESC');
  return r.rows.map((row) => rowToBook(row as unknown as Record<string, unknown>));
}

export async function getBook(id: string): Promise<Book | null> {
  const c = getLibSqlClient();
  const r = await c.execute({ sql: 'SELECT * FROM book WHERE id = ?', args: [id] });
  if (r.rows.length === 0) return null;
  return rowToBook(r.rows[0] as unknown as Record<string, unknown>);
}

export async function createBook(input: CreateBookInput): Promise<Book> {
  const c = getLibSqlClient();
  const id = crypto.randomUUID();
  const now = Date.now();
  await c.execute({
    sql: `INSERT INTO book (id, title, synopsis, status, lineup_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, input.title, input.synopsis ?? null, input.status ?? 'active', input.lineupId ?? null, now, now],
  });
  return (await getBook(id))!;
}

export async function updateBook(id: string, patch: UpdateBookInput): Promise<Book | null> {
  const c = getLibSqlClient();
  const current = await getBook(id);
  if (!current) return null;

  const now = Date.now();
  await c.execute({
    sql: `UPDATE book
          SET title = ?, synopsis = ?, status = ?, lineup_id = ?, updated_at = ?
          WHERE id = ?`,
    args: [
      patch.title ?? current.title,
      patch.synopsis !== undefined ? patch.synopsis : current.synopsis,
      patch.status ?? current.status,
      patch.lineupId !== undefined ? patch.lineupId : current.lineupId,
      now,
      id,
    ],
  });

  return getBook(id);
}

export async function deleteBook(id: string): Promise<boolean> {
  const c = getLibSqlClient();
  const r = await c.execute({ sql: 'DELETE FROM book WHERE id = ?', args: [id] });
  return r.rowsAffected > 0;
}

export async function getDocumentTree(bookId: string): Promise<DocumentNode[]> {
  const c = getLibSqlClient();
  const r = await c.execute({
    sql: `SELECT id, book_id, parent_id, kind, title, word_count, order_index, created_at, updated_at
          FROM document WHERE book_id = ? ORDER BY order_index ASC, created_at ASC`,
    args: [bookId],
  });
  const nodes: DocumentNode[] = r.rows.map((row) => {
    const d = rowToDoc({ ...(row as unknown as Record<string, unknown>), content: '' });
    return { ...d, content: undefined as never, children: [] } as DocumentNode;
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: DocumentNode[] = [];
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const c = getLibSqlClient();
  const r = await c.execute({ sql: 'SELECT * FROM document WHERE id = ?', args: [id] });
  if (r.rows.length === 0) return null;
  return rowToDoc(r.rows[0] as unknown as Record<string, unknown>);
}

export async function seedSampleBookIfEmpty(): Promise<void> {
  const c = getLibSqlClient();
  const existing = await c.execute('SELECT COUNT(*) AS n FROM book');
  if (Number((existing.rows[0] as unknown as { n: number }).n) > 0) return;

  const now = Date.now();
  const bookId = rid('book');
  await c.execute({
    sql: `INSERT INTO book (id, title, synopsis, status, lineup_id, created_at, updated_at)
          VALUES (?, ?, ?, 'active', ?, ?, ?)`,
    args: [bookId, '示例长篇:星海拾遗', '一个关于失落文明与年轻探险者的科幻长篇示例。', null, now, now],
  });

  type SeedDoc = {
    kind: DocumentKind;
    title: string;
    content?: string;
    children?: SeedDoc[];
  };

  const tree: SeedDoc[] = [
    {
      kind: 'folder',
      title: '设定',
      children: [
        {
          kind: 'setting',
          title: '世界观:坍缩星域',
          content:
            '坍缩星域是位于猎户臂边缘的恒星墓地,由数百颗超新星残骸构成。\n空间湍流频发,只有装备 ψ-稳定器的飞船才能安全穿越。',
        },
        {
          kind: 'setting',
          title: '主角:林屿',
          content: '22 岁的星图绘制员,父亲是失踪的文明研究学者,继承了一台旧型号探测仪。',
        },
      ],
    },
    {
      kind: 'folder',
      title: '大纲',
      children: [
        {
          kind: 'outline',
          title: '第一卷大纲',
          content: '1. 林屿接到拍卖行的匿名邀请\n2. 在废弃站点拾得 "拾遗者" 残骸\n3. 与执法局正面冲突',
        },
      ],
    },
    {
      kind: 'folder',
      title: '卷一:拾遗者',
      children: [
        {
          kind: 'chapter',
          title: '第一章 匿名的请柬',
          content:
            '林屿盯着终端上跳动的红点,那是一封没有发件人的加密邀请函。\n邀请函只有一行字:"你父亲留下的东西,在拍卖行第七号库。"',
        },
        {
          kind: 'chapter',
          title: '第二章 第七号库',
          content: '拍卖行的电梯下行了整整三分钟。林屿数着心跳,指尖在探测仪外壳上微微发颤。',
        },
      ],
    },
  ];

  let order = 0;
  async function insert(parentId: string | null, doc: SeedDoc): Promise<void> {
    const id = rid('doc');
    const wc = (doc.content ?? '').replace(/\s+/g, '').length;
    await c.execute({
      sql: `INSERT INTO document
            (id, book_id, parent_id, kind, title, content, word_count, order_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, bookId, parentId, doc.kind, doc.title, doc.content ?? '', wc, order++, now, now],
    });
    if (doc.children) {
      for (const child of doc.children) await insert(id, child);
    }
  }

  for (const root of tree) await insert(null, root);
}
