import { useEffect, useRef, useState, useMemo } from 'react';
import { RiAddLine, RiPencilLine, RiDeleteBin6Line, RiChat3Line, RiCornerDownRightLine } from '@remixicon/react';
import {
  makeLibraryApi,
  AGENT_LABELS,
  getThreadAgentId,
  getThreadParentId,
  isDelegatedSubThread,
  type ChatThread,
  type AgentId,
} from './api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

const DEFAULT_THREAD_TITLE = '新会话';
const POLL_INTERVAL_MS = 3000;

function lsKey(bookId: string) {
  return `nls:activeThreadId:${bookId}`;
}

type ThreadNode = {
  thread: ChatThread;
  children: ThreadNode[];
};

function buildThreadTree(threads: ChatThread[]): ThreadNode[] {
  const byId = new Map<string, ThreadNode>();
  for (const t of threads) byId.set(t.id, { thread: t, children: [] });
  const roots: ThreadNode[] = [];
  for (const node of byId.values()) {
    const parentId = getThreadParentId(node.thread);
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byUpdatedDesc = (a: ThreadNode, b: ThreadNode) =>
    String(b.thread.updatedAt).localeCompare(String(a.thread.updatedAt));
  const byCreatedAsc = (a: ThreadNode, b: ThreadNode) =>
    String(a.thread.createdAt).localeCompare(String(b.thread.createdAt));
  roots.sort(byUpdatedDesc);
  for (const node of byId.values()) node.children.sort(byCreatedAsc);
  return roots;
}

export function ThreadList({
  backendUrl,
  activeBookId,
  activeThreadId,
  onThreadSelect,
  onThreadsChanged,
  onActiveThreadTitleChange,
  onActiveAgentIdChange,
  onActiveThreadChange,
  onThreadsLoaded,
}: {
  backendUrl: string;
  activeBookId: string | null;
  activeThreadId: string | null;
  onThreadSelect: (threadId: string | null) => void;
  onThreadsChanged?: () => void;
  onActiveThreadTitleChange?: (title: string | null) => void;
  onActiveAgentIdChange?: (agentId: AgentId) => void;
  onActiveThreadChange?: (thread: ChatThread | null) => void;
  onThreadsLoaded?: (threads: ChatThread[]) => void;
}) {
  const api = useMemo(() => makeLibraryApi(backendUrl), [backendUrl]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [renameTarget, setRenameTarget] = useState<ChatThread | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ChatThread | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);

  const deleteConfirmable =
    deleteTarget !== null &&
    deleteInput.trim() === (deleteTarget.title ?? DEFAULT_THREAD_TITLE);

  const creatingRef = useRef(false);

  useEffect(() => {
    if (!activeBookId) {
      setThreads([]);
      onThreadSelect(null);
      return;
    }

    let cancelled = false;
    creatingRef.current = false;

    async function load() {
      if (!activeBookId) return;
      setLoading(true);
      setError(null);
      try {
        const list = await api.listThreads(activeBookId);
        if (cancelled) return;
        setThreads(list);
        onThreadsLoaded?.(list);

        const saved = localStorage.getItem(lsKey(activeBookId));
        const found = saved ? list.find((t) => t.id === saved) : null;

        if (list.length === 0) {
          if (creatingRef.current) return;
          creatingRef.current = true;
          const created = await api.createThread(activeBookId, DEFAULT_THREAD_TITLE, 'supervisor');
          if (cancelled) return;
          setThreads([created]);
          onThreadsLoaded?.([created]);
          onThreadSelect(created.id);
          localStorage.setItem(lsKey(activeBookId), created.id);
          onActiveThreadTitleChange?.(created.title ?? DEFAULT_THREAD_TITLE);
          onActiveAgentIdChange?.(getThreadAgentId(created));
          onActiveThreadChange?.(created);
          onThreadsChanged?.();
        } else if (found) {
          onThreadSelect(found.id);
          onActiveThreadTitleChange?.(found.title ?? DEFAULT_THREAD_TITLE);
          onActiveAgentIdChange?.(getThreadAgentId(found));
          onActiveThreadChange?.(found);
        } else {
          onThreadSelect(list[0].id);
          localStorage.setItem(lsKey(activeBookId), list[0].id);
          onActiveThreadTitleChange?.(list[0].title ?? DEFAULT_THREAD_TITLE);
          onActiveAgentIdChange?.(getThreadAgentId(list[0]));
          onActiveThreadChange?.(list[0]);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, activeBookId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeBookId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (cancelled) return;
      void api
        .listThreads(activeBookId)
        .then((list) => {
          if (cancelled) return;
          onThreadsLoaded?.(list);
          setThreads((prev) => {
            if (prev.length !== list.length) return list;
            const prevIds = new Set(prev.map((t) => t.id));
            const sameIds = list.every((t) => prevIds.has(t.id));
            if (!sameIds) return list;
            const titleChanged = list.some((t) => {
              const prevT = prev.find((p) => p.id === t.id);
              return !prevT || prevT.title !== t.title || prevT.updatedAt !== t.updatedAt;
            });
            return titleChanged ? list : prev;
          });
        })
        .catch(() => undefined);
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [api, activeBookId]);

  async function handleNewThread() {
    if (!activeBookId) return;
    setCreating(true);
    try {
      const created = await api.createThread(activeBookId, DEFAULT_THREAD_TITLE, 'supervisor');
      setThreads((prev) => [created, ...prev]);
      onThreadSelect(created.id);
      localStorage.setItem(lsKey(activeBookId), created.id);
      onActiveThreadTitleChange?.(created.title ?? DEFAULT_THREAD_TITLE);
      onActiveAgentIdChange?.(getThreadAgentId(created));
      onActiveThreadChange?.(created);
      onThreadsChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameConfirm() {
    if (!renameTarget) return;
    const title = renameInput.trim();
    if (!title) return;
    setRenaming(true);
    setRenameError(null);
    try {
      const updated = await api.renameThread(renameTarget.id, title);
      setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setRenameTarget(null);
      onThreadsChanged?.();
    } catch (e) {
      setRenameError(String(e));
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || !activeBookId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteThread(deleteTarget.id);
      const remaining = threads.filter((t) => t.id !== deleteTarget.id);
      setThreads(remaining);

      if (activeThreadId === deleteTarget.id) {
        const fallback = remaining.find((t) => !getThreadParentId(t)) ?? remaining[0];
        if (fallback) {
          onThreadSelect(fallback.id);
          localStorage.setItem(lsKey(activeBookId), fallback.id);
          onActiveThreadTitleChange?.(fallback.title ?? DEFAULT_THREAD_TITLE);
          onActiveAgentIdChange?.(getThreadAgentId(fallback));
          onActiveThreadChange?.(fallback);
        } else {
          const created = await api.createThread(activeBookId, DEFAULT_THREAD_TITLE, 'supervisor');
          setThreads([created]);
          onThreadSelect(created.id);
          localStorage.setItem(lsKey(activeBookId), created.id);
          onActiveThreadTitleChange?.(created.title ?? DEFAULT_THREAD_TITLE);
          onActiveAgentIdChange?.(getThreadAgentId(created));
          onActiveThreadChange?.(created);
        }
      }

      setDeleteTarget(null);
      setDeleteInput('');
      onThreadsChanged?.();
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  function selectThread(id: string) {
    if (!activeBookId) return;
    onThreadSelect(id);
    localStorage.setItem(lsKey(activeBookId), id);
    const t = threads.find((th) => th.id === id) ?? null;
    onActiveThreadTitleChange?.(t?.title ?? DEFAULT_THREAD_TITLE);
    onActiveAgentIdChange?.(getThreadAgentId(t));
    onActiveThreadChange?.(t);
  }

  ThreadList.patchTitle = (threadId: string, newTitle: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t)),
    );
  };

  const tree = useMemo(() => buildThreadTree(threads), [threads]);

  return (
    <div className="flex flex-col gap-1 h-full">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-600">会话</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="新建会话"
          title="新建总编辑会话"
          disabled={!activeBookId || creating}
          onClick={() => void handleNewThread()}
        >
          <RiAddLine className="size-3.5" />
        </Button>
      </div>

      {loading && (
        <div className="text-xs text-neutral-600 px-1">加载中…</div>
      )}

      {!loading && tree.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
          {tree.map((node) => (
            <ThreadNodeRow
              key={node.thread.id}
              node={node}
              depth={0}
              activeThreadId={activeThreadId}
              onSelect={selectThread}
              onRename={(t) => {
                setRenameError(null);
                setRenameInput(t.title ?? DEFAULT_THREAD_TITLE);
                setRenameTarget(t);
              }}
              onDelete={(t) => {
                setDeleteError(null);
                setDeleteTarget(t);
                setDeleteInput('');
              }}
            />
          ))}
        </div>
      )}

      {!loading && !activeBookId && (
        <div className="text-xs text-neutral-600 px-1">请先选择书籍</div>
      )}

      {error && <div className="text-xs text-red-400 px-1">{error}</div>}

      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      >
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>重命名会话</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            autoComplete="off"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameInput.trim()) {
                e.preventDefault();
                void handleRenameConfirm();
              }
            }}
            placeholder="输入新名称…"
          />
          {renameError && (
            <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {renameError}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button
              disabled={!renameInput.trim() || renaming}
              onClick={() => void handleRenameConfirm()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteInput('');
          }
        }}
      >
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-300">
                即将删除会话{' '}
                <span className="font-medium text-red-400">
                  {deleteTarget.title ?? DEFAULT_THREAD_TITLE}
                </span>
                。此操作不可撤销。
              </p>
              <p className="text-xs text-muted-foreground">
                请输入会话名{' '}
                <code className="text-neutral-300">
                  {deleteTarget.title ?? DEFAULT_THREAD_TITLE}
                </code>{' '}
                以确认删除：
              </p>
              <Input
                autoFocus
                autoComplete="off"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteConfirmable) {
                    e.preventDefault();
                    void handleDeleteConfirm();
                  }
                }}
                placeholder={deleteTarget.title ?? DEFAULT_THREAD_TITLE}
              />
              {deleteError && (
                <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {deleteError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteInput('');
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteConfirmable || deleting}
              onClick={() => void handleDeleteConfirm()}
            >
              <RiDeleteBin6Line className="size-3.5" /> 确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

ThreadList.patchTitle = (_threadId: string, _newTitle: string): void => {
  void 0;
};

function ThreadNodeRow({
  node,
  depth,
  activeThreadId,
  onSelect,
  onRename,
  onDelete,
}: {
  node: ThreadNode;
  depth: number;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onRename: (t: ChatThread) => void;
  onDelete: (t: ChatThread) => void;
}) {
  const t = node.thread;
  const label = t.title ?? DEFAULT_THREAD_TITLE;
  const isActive = t.id === activeThreadId;
  const agentId = getThreadAgentId(t);
  const agentLabel = AGENT_LABELS[agentId];
  const isSub = isDelegatedSubThread(t);

  return (
    <>
      <div
        className="group flex items-center gap-0.5 rounded"
        style={depth > 0 ? { paddingLeft: depth * 12 } : undefined}
      >
        <button
          onClick={() => onSelect(t.id)}
          className={cn(
            'flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-left truncate transition-colors',
            isActive
              ? 'bg-neutral-800 text-neutral-100'
              : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
          )}
        >
          {isSub ? (
            <RiCornerDownRightLine className="size-3.5 shrink-0 text-neutral-500" />
          ) : (
            <RiChat3Line className="size-3.5 shrink-0" />
          )}
          <span className="truncate flex-1">{label}</span>
          <span
            className={cn(
              'shrink-0 rounded px-1 py-0 text-[9px] leading-4 font-normal',
              isActive
                ? 'bg-indigo-500/30 text-indigo-200'
                : isSub
                  ? 'bg-indigo-950/60 text-indigo-300/80'
                  : 'bg-neutral-800 text-neutral-500 group-hover:bg-neutral-800',
            )}
            title={agentId}
          >
            {agentLabel}
          </span>
        </button>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="重命名"
            onClick={() => onRename(t)}
          >
            <RiPencilLine className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="删除"
            className="text-neutral-400 hover:text-red-400 hover:bg-red-950/40"
            onClick={() => onDelete(t)}
          >
            <RiDeleteBin6Line className="size-3.5" />
          </Button>
        </div>
      </div>
      {node.children.map((child) => (
        <ThreadNodeRow
          key={child.thread.id}
          node={child}
          depth={depth + 1}
          activeThreadId={activeThreadId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
