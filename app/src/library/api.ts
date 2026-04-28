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

export type DocumentNode = {
  id: string;
  bookId: string;
  parentId: string | null;
  kind: DocumentKind;
  title: string;
  wordCount: number;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
  children: DocumentNode[];
};

export type DocumentDetail = Omit<DocumentNode, 'children'> & {
  content: string;
};

export type ChatThread = {
  id: string;
  title?: string;
  resourceId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export function makeLibraryApi(backendUrl: string) {
  const url = (p: string) => `${backendUrl}${p}`;

  return {
    async listBooks(): Promise<Book[]> {
      const r = await fetch(url('/api/books'));
      const j = (await r.json()) as { books: Book[] };
      return j.books;
    },
    async createBook(body: {
      title: string;
      synopsis?: string;
      status?: string;
      lineupId?: string | null;
    }): Promise<Book> {
      const r = await fetch(url('/api/books'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `create book failed: ${r.status}`);
      }
      return (await r.json()) as Book;
    },
    async updateBook(
      id: string,
      body: { title?: string; synopsis?: string | null; status?: string; lineupId?: string | null },
    ): Promise<Book> {
      const r = await fetch(url(`/api/books/${id}`), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `update book failed: ${r.status}`);
      }
      return (await r.json()) as Book;
    },
    async deleteBook(id: string): Promise<void> {
      const r = await fetch(url(`/api/books/${id}`), { method: 'DELETE' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `delete book failed: ${r.status}`);
      }
    },
    async listLineups(): Promise<Array<{ id: string; label: string }>> {
      const r = await fetch(url('/api/config/lineups'));
      const j = (await r.json()) as { lineups: Array<{ id: string; label: string }> };
      return j.lineups;
    },
    async getTree(bookId: string): Promise<DocumentNode[]> {
      const r = await fetch(url(`/api/books/${bookId}/tree`));
      const j = (await r.json()) as { tree: DocumentNode[] };
      return j.tree;
    },
    async getDocument(id: string): Promise<DocumentDetail> {
      const r = await fetch(url(`/api/documents/${id}`));
      if (!r.ok) throw new Error(`document fetch failed: ${r.status}`);
      const j = (await r.json()) as { document: DocumentDetail };
      return j.document;
    },
    async listThreads(bookId: string): Promise<ChatThread[]> {
      const r = await fetch(url(`/api/threads?bookId=${encodeURIComponent(bookId)}`));
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `list threads failed: ${r.status}`);
      }
      const j = (await r.json()) as { threads: ChatThread[] };
      return j.threads;
    },
    async createThread(bookId: string, title?: string): Promise<ChatThread> {
      const r = await fetch(url('/api/threads'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, title }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `create thread failed: ${r.status}`);
      }
      const j = (await r.json()) as { thread: ChatThread };
      return j.thread;
    },
    async renameThread(id: string, title: string): Promise<ChatThread> {
      const r = await fetch(url(`/api/threads/${id}`), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `rename thread failed: ${r.status}`);
      }
      const j = (await r.json()) as { thread: ChatThread };
      return j.thread;
    },
    async deleteThread(id: string): Promise<void> {
      const r = await fetch(url(`/api/threads/${id}`), { method: 'DELETE' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `delete thread failed: ${r.status}`);
      }
    },
  };
}
