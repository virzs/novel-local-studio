import { useEffect, useRef, useState, useMemo } from 'react';
import { RiAddLine, RiPencilLine, RiDeleteBin6Line, RiChat3Line } from '@remixicon/react';
import { makeLibraryApi, type ChatThread } from './api';
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

function lsKey(bookId: string) {
  return `nls:activeThreadId:${bookId}`;
}

export function ThreadList({
  backendUrl,
  activeBookId,
  activeThreadId,
  onThreadSelect,
  onThreadsChanged,
  onActiveThreadTitleChange,
}: {
  backendUrl: string;
  activeBookId: string | null;
  activeThreadId: string | null;
  onThreadSelect: (threadId: string | null) => void;
  onThreadsChanged?: () => void;
  onActiveThreadTitleChange?: (title: string | null) => void;
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

        const saved = localStorage.getItem(lsKey(activeBookId));
        const found = saved ? list.find((t) => t.id === saved) : null;

        if (list.length === 0) {
          if (creatingRef.current) return;
          creatingRef.current = true;
          const created = await api.createThread(activeBookId, DEFAULT_THREAD_TITLE);
          if (cancelled) return;
          setThreads([created]);
          onThreadSelect(created.id);
          localStorage.setItem(lsKey(activeBookId), created.id);
          onActiveThreadTitleChange?.(created.title ?? DEFAULT_THREAD_TITLE);
          onThreadsChanged?.();
        } else if (found) {
          onThreadSelect(found.id);
          onActiveThreadTitleChange?.(found.title ?? DEFAULT_THREAD_TITLE);
        } else {
          onThreadSelect(list[0].id);
          localStorage.setItem(lsKey(activeBookId), list[0].id);
          onActiveThreadTitleChange?.(list[0].title ?? DEFAULT_THREAD_TITLE);
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

  async function handleNewThread() {
    if (!activeBookId) return;
    try {
      const created = await api.createThread(activeBookId, DEFAULT_THREAD_TITLE);
      setThreads((prev) => [created, ...prev]);
      onThreadSelect(created.id);
      localStorage.setItem(lsKey(activeBookId), created.id);
      onActiveThreadTitleChange?.(created.title ?? DEFAULT_THREAD_TITLE);
      onThreadsChanged?.();
    } catch (e) {
      setError(String(e));
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
        if (remaining.length > 0) {
          onThreadSelect(remaining[0].id);
          localStorage.setItem(lsKey(activeBookId), remaining[0].id);
          onActiveThreadTitleChange?.(remaining[0].title ?? DEFAULT_THREAD_TITLE);
        } else {
          const created = await api.createThread(activeBookId, DEFAULT_THREAD_TITLE);
          setThreads([created]);
          onThreadSelect(created.id);
          localStorage.setItem(lsKey(activeBookId), created.id);
          onActiveThreadTitleChange?.(created.title ?? DEFAULT_THREAD_TITLE);
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
    const t = threads.find((th) => th.id === id);
    onActiveThreadTitleChange?.(t?.title ?? DEFAULT_THREAD_TITLE);
  }

  ThreadList.patchTitle = (threadId: string, newTitle: string) => {
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, title: newTitle } : t)),
    );
  };

  return (
    <div className="flex flex-col gap-1 h-full">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-600">会话</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="新建会话"
          title="新建会话"
          disabled={!activeBookId}
          onClick={() => void handleNewThread()}
        >
          <RiAddLine className="size-3.5" />
        </Button>
      </div>

      {loading && (
        <div className="text-xs text-neutral-600 px-1">加载中…</div>
      )}

      {!loading && threads.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
          {threads.map((t) => {
            const label = t.title ?? DEFAULT_THREAD_TITLE;
            const isActive = t.id === activeThreadId;
            return (
              <div key={t.id} className="group flex items-center gap-0.5 rounded">
                <button
                  onClick={() => selectThread(t.id)}
                  className={cn(
                    'flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-left truncate transition-colors',
                    isActive
                      ? 'bg-neutral-800 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
                  )}
                >
                  <RiChat3Line className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="重命名"
                    onClick={() => {
                      setRenameError(null);
                      setRenameInput(t.title ?? DEFAULT_THREAD_TITLE);
                      setRenameTarget(t);
                    }}
                  >
                    <RiPencilLine className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除"
                    className="text-neutral-400 hover:text-red-400 hover:bg-red-950/40"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(t);
                      setDeleteInput('');
                    }}
                  >
                    <RiDeleteBin6Line className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
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
