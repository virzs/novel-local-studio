import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RiBookOpenLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiFileTextLine,
  RiQuillPenLine,
  RiCompass3Line,
  RiStickyNoteLine,
  RiAddLine,
  RiPencilLine,
  RiDeleteBin6Line,
} from '@remixicon/react';
import { makeLibraryApi, type Book, type DocumentKind, type DocumentNode } from './api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

const BOOK_FORM_ID = 'book-edit-form';

const DEFAULT_LINEUP_OPTION = { id: 'default', label: '默认阵容' } as const;

const BOOK_STATUS_OPTIONS = [
  { value: 'planning', label: '规划中' },
  { value: 'drafting', label: '创作中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
] as const;

const bookFormSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空'),
  synopsis: z.string(),
  status: z.enum(['planning', 'drafting', 'paused', 'completed', 'archived']),
  lineupId: z.string().min(1, '请选择阵容'),
});

type BookFormValues = z.infer<typeof bookFormSchema>;
type LineupOption = { id: string; label: string };

function BookForm({
  defaultValues,
  lineupOptions,
  onValid,
}: {
  defaultValues?: Partial<BookFormValues>;
  lineupOptions: LineupOption[];
  onValid: (values: BookFormValues) => void | Promise<void>;
}) {
  const allLineups: LineupOption[] = [DEFAULT_LINEUP_OPTION, ...lineupOptions];

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: {
      title: defaultValues?.title ?? '',
      synopsis: defaultValues?.synopsis ?? '',
      status: defaultValues?.status ?? 'planning',
      lineupId: defaultValues?.lineupId ?? DEFAULT_LINEUP_OPTION.id,
    },
  });

  return (
    <Form {...form}>
      <form
        id={BOOK_FORM_ID}
        onSubmit={form.handleSubmit(onValid)}
        className="space-y-4"
        autoComplete="off"
      >
        <input
          type="text"
          name="website"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>书名</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="输入书名…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="synopsis"
          render={({ field }) => (
            <FormItem>
              <FormLabel>简介（可选）</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  className="w-full min-h-[80px] rounded-md border border-input bg-transparent px-3 py-2 text-sm text-neutral-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                  placeholder="输入简介…"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>状态</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BOOK_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lineupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>阵容</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择阵容" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {allLineups.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );
}

export function BookTree({
  backendUrl,
  selectedDocId,
  onSelectDocument,
  activeBookId,
  onActiveBookChange,
}: {
  backendUrl: string;
  selectedDocId: string | null;
  onSelectDocument: (id: string) => void;
  activeBookId: string | null;
  onActiveBookChange: (id: string | null) => void;
}) {
  const api = useMemo(() => makeLibraryApi(backendUrl), [backendUrl]);
  const [books, setBooks] = useState<Book[]>([]);
  const [lineupOptions, setLineupOptions] = useState<LineupOption[]>([]);
  const [tree, setTree] = useState<DocumentNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [bookEditTarget, setBookEditTarget] = useState<
    { mode: 'create' } | { mode: 'edit'; book: Book } | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const deleteConfirmable =
    deleteTarget !== null && deleteInput.trim() === deleteTarget.title;

  useEffect(() => {
    (async () => {
      try {
        const [bs, ls] = await Promise.all([api.listBooks(), api.listLineups()]);
        setBooks(bs);
        setLineupOptions(ls);
        if (bs[0] && !activeBookId) onActiveBookChange(bs[0].id);
      } catch (e) {
        setError(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    if (!activeBookId) {
      setTree([]);
      return;
    }
    (async () => {
      try {
        const t = await api.getTree(activeBookId);
        setTree(t);
        setExpanded(new Set(collectFolderIds(t)));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [api, activeBookId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshBookList() {
    const bs = await api.listBooks();
    setBooks(bs);
    return bs;
  }

  async function handleBookSave(values: BookFormValues) {
    setPersistError(null);
    setPersisting(true);
    try {
      const synopsis = values.synopsis.trim() || null;
      if (bookEditTarget?.mode === 'edit') {
        await api.updateBook(bookEditTarget.book.id, {
          title: values.title,
          synopsis,
          status: values.status,
          lineupId: values.lineupId,
        });
        await refreshBookList();
        onActiveBookChange(activeBookId);
      } else {
        const newBook = await api.createBook({
          title: values.title,
          synopsis: synopsis ?? undefined,
          status: values.status,
          lineupId: values.lineupId,
        });
        await refreshBookList();
        onActiveBookChange(newBook.id);
      }
      setBookEditTarget(null);
    } catch (e) {
      setPersistError(String(e));
    } finally {
      setPersisting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setPersistError(null);
    setPersisting(true);
    try {
      await api.deleteBook(deleteTarget.id);
      const bs = await refreshBookList();
      if (activeBookId === deleteTarget.id) {
        onActiveBookChange(bs[0]?.id ?? null);
      }
      setDeleteTarget(null);
      setDeleteInput('');
    } catch (e) {
      setPersistError(String(e));
    } finally {
      setPersisting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-neutral-600">书籍</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="新建书籍"
          title="新建书籍"
          onClick={() => {
            setPersistError(null);
            setBookEditTarget({ mode: 'create' });
          }}
        >
          <RiAddLine className="size-3.5" />
        </Button>
      </div>

      {books.length > 0 && (
        <div className="space-y-0.5">
          {books.map((b) => (
            <div key={b.id} className="group flex items-center gap-0.5 rounded">
              <button
                onClick={() => onActiveBookChange(b.id)}
                className={cn(
                  'flex-1 flex items-center gap-1.5 px-1.5 py-1 rounded text-xs text-left truncate transition-colors',
                  b.id === activeBookId
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200',
                )}
              >
                <RiBookOpenLine className="size-3.5 shrink-0" />
                <span className="truncate">{b.title}</span>
              </button>
              <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="编辑"
                  onClick={() => {
                    setPersistError(null);
                    setBookEditTarget({ mode: 'edit', book: b });
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
                    setPersistError(null);
                    setDeleteTarget(b);
                    setDeleteInput('');
                  }}
                >
                  <RiDeleteBin6Line className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}

      <div className="flex-1 overflow-y-auto -mx-1">
        {tree.length === 0 && !error && (
          <div className="text-xs text-neutral-600 px-2 py-3">暂无内容</div>
        )}
        <ul className="space-y-0.5">
          {tree.map((n) => (
            <TreeNode
              key={n.id}
              node={n}
              depth={0}
              expanded={expanded}
              selectedId={selectedDocId}
              onToggle={toggle}
              onSelect={onSelectDocument}
            />
          ))}
        </ul>
      </div>

      <Dialog
        open={!!bookEditTarget}
        onOpenChange={(o) => {
          if (!o) setBookEditTarget(null);
        }}
      >
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {bookEditTarget?.mode === 'edit'
                ? `编辑书籍 · ${bookEditTarget.book.title}`
                : '新建书籍'}
            </DialogTitle>
          </DialogHeader>
          {bookEditTarget && (
            <BookForm
              key={bookEditTarget.mode === 'edit' ? bookEditTarget.book.id : 'new'}
              defaultValues={
                bookEditTarget.mode === 'edit'
                  ? {
                      title: bookEditTarget.book.title,
                      synopsis: bookEditTarget.book.synopsis ?? '',
                      status:
                        (BOOK_STATUS_OPTIONS.find(
                          (o) => o.value === bookEditTarget.book.status,
                        )?.value ?? 'planning') as BookFormValues['status'],
                      lineupId: bookEditTarget.book.lineupId ?? DEFAULT_LINEUP_OPTION.id,
                    }
                  : undefined
              }
              lineupOptions={lineupOptions}
              onValid={(values) => void handleBookSave(values)}
            />
          )}
          {persistError && bookEditTarget && (
            <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {persistError}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button type="submit" form={BOOK_FORM_ID} disabled={persisting}>
              {bookEditTarget?.mode === 'edit' ? '保存' : '创建'}
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
            <DialogTitle>删除书籍</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-300">
                即将删除书籍{' '}
                <span className="font-medium text-red-400">{deleteTarget.title}</span>
                。此操作不可撤销。
              </p>
              <p className="text-xs text-muted-foreground">
                请输入书名{' '}
                <code className="text-neutral-300">{deleteTarget.title}</code>{' '}
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
                placeholder={deleteTarget.title}
              />
              {persistError && (
                <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {persistError}
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
              disabled={!deleteConfirmable || persisting}
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

function collectFolderIds(nodes: DocumentNode[]): string[] {
  const ids: string[] = [];
  const walk = (ns: DocumentNode[]) => {
    for (const n of ns) {
      if (n.kind === 'folder') ids.push(n.id);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

function TreeNode({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: DocumentNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const isFolder = node.kind === 'folder' || node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;

  return (
    <li>
      <button
        onClick={() => {
          if (isFolder) onToggle(node.id);
          if (node.kind !== 'folder') onSelect(node.id);
        }}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className={`group w-full flex items-center gap-1.5 pr-2 py-1 rounded text-xs text-left transition-colors ${
          isSelected
            ? 'bg-neutral-800 text-neutral-100'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
        }`}
      >
        <KindIcon kind={node.kind} open={isOpen} />
        <span className="truncate flex-1">{node.title}</span>
        {node.kind !== 'folder' && node.wordCount > 0 && (
          <span className="text-[10px] text-neutral-600 group-hover:text-neutral-500">
            {node.wordCount}
          </span>
        )}
      </button>
      {isFolder && isOpen && node.children.length > 0 && (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function KindIcon({ kind, open }: { kind: DocumentKind; open: boolean }) {
  const cls = 'size-3.5 shrink-0';
  switch (kind) {
    case 'folder':
      return open ? <RiFolderOpenLine className={cls} /> : <RiFolderLine className={cls} />;
    case 'chapter':
      return <RiQuillPenLine className={cls} />;
    case 'setting':
      return <RiFileTextLine className={cls} />;
    case 'outline':
      return <RiCompass3Line className={cls} />;
    case 'note':
      return <RiStickyNoteLine className={cls} />;
  }
}
