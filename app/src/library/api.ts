export type DocumentKind = 'folder' | 'chapter' | 'setting' | 'outline' | 'note';

export type DocumentStatus = 'active' | 'archived' | 'deleted';

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
  status: DocumentStatus;
  archivedAt: number | null;
  deletedAt: number | null;
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
  metadata?: Record<string, unknown> & {
    agentId?: string;
    parentThreadId?: string;
    delegated?: boolean;
  };
};

export const AGENT_IDS = ['supervisor', 'architect', 'chronicler', 'editor', 'loreKeeper'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export const AGENT_LABELS: Record<AgentId, string> = {
  supervisor: '总编辑',
  architect: '架构师',
  chronicler: '执笔者',
  editor: '润色师',
  loreKeeper: '设定守护者',
};

export function getThreadAgentId(thread: ChatThread | null | undefined): AgentId {
  const v = thread?.metadata?.agentId;
  if (typeof v === 'string' && (AGENT_IDS as readonly string[]).includes(v)) return v as AgentId;
  return 'supervisor';
}

export function getThreadParentId(thread: ChatThread | null | undefined): string | null {
  const v = thread?.metadata?.parentThreadId;
  return typeof v === 'string' && v ? v : null;
}

export function isDelegatedSubThread(thread: ChatThread | null | undefined): boolean {
  return Boolean(thread?.metadata?.delegated) && Boolean(getThreadParentId(thread));
}

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
    async getTree(
      bookId: string,
      opts?: { includeArchived?: boolean; includeDeleted?: boolean; rootId?: string; depth?: number },
    ): Promise<DocumentNode[]> {
      const params = new URLSearchParams();
      if (opts?.includeArchived) params.set('includeArchived', 'true');
      if (opts?.includeDeleted) params.set('includeDeleted', 'true');
      if (opts?.rootId) params.set('rootId', opts.rootId);
      if (opts?.depth !== undefined) params.set('depth', String(opts.depth));
      const qs = params.toString();
      const r = await fetch(url(`/api/books/${bookId}/tree${qs ? `?${qs}` : ''}`));
      const j = (await r.json()) as { tree: DocumentNode[] };
      return j.tree;
    },
    async getDocument(id: string): Promise<DocumentDetail> {
      const r = await fetch(url(`/api/documents/${id}`));
      if (!r.ok) throw new Error(`document fetch failed: ${r.status}`);
      const j = (await r.json()) as { document: DocumentDetail };
      return j.document;
    },
    async archiveDocument(id: string): Promise<void> {
      const r = await fetch(url(`/api/documents/${id}/archive`), { method: 'POST' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `archive document failed: ${r.status}`);
      }
    },
    async restoreDocument(id: string): Promise<void> {
      const r = await fetch(url(`/api/documents/${id}/restore`), { method: 'POST' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `restore document failed: ${r.status}`);
      }
    },
    async softDeleteDocument(id: string): Promise<void> {
      const r = await fetch(url(`/api/documents/${id}`), { method: 'DELETE' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `delete document failed: ${r.status}`);
      }
    },
    async purgeDocument(id: string): Promise<void> {
      const r = await fetch(url(`/api/documents/${id}/purge`), { method: 'POST' });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `purge document failed: ${r.status}`);
      }
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
    async createThread(bookId: string, title?: string, agentId?: string): Promise<ChatThread> {
      const r = await fetch(url('/api/threads'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId, title, agentId }),
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
    async getThreadMessages(id: string): Promise<unknown[]> {
      const r = await fetch(url(`/api/threads/${id}/messages`));
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `get thread messages failed: ${r.status}`);
      }
      const j = (await r.json()) as { messages: unknown[] };
      return j.messages;
    },
  };
}
