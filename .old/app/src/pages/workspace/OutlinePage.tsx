import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { PlusIcon, TrashIcon, ChevronRightIcon } from '../../components/business/shared/Icons';
import { listOutlines, createOutline, updateOutline, deleteOutline, type Outline } from '../../api';
import { useAIChat } from '../../contexts/AIChatContext';

function StatusBadge({ status }: { status: Outline['status'] }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
        完成
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium bg-muted text-muted-foreground border border-border">
      草稿
    </span>
  );
}

function InlineEditForm({
  node,
  onSave,
  onCancel,
}: {
  node: Outline;
  onSave: (updated: Outline) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? '');
  const [status, setStatus] = useState<Outline['status']>(node.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError('标题为必填项'); return; }
    setSaving(true); setError(null);
    try {
      const updated = await updateOutline(node.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
      });
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="简介（可选）"
        rows={3}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">状态：</span>
        <button
          type="button"
          onClick={() => setStatus('draft')}
          className={[
            'text-xs px-2 py-0.5 rounded-sm border transition-colors',
            status === 'draft'
              ? 'border-border bg-muted text-muted-foreground'
              : 'border-transparent text-muted-foreground/50 hover:border-border',
          ].join(' ')}
        >
          草稿
        </button>
        <button
          type="button"
          onClick={() => setStatus('done')}
          className={[
            'text-xs px-2 py-0.5 rounded-sm border transition-colors',
            status === 'done'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
              : 'border-transparent text-muted-foreground/50 hover:border-border',
          ].join(' ')}
        >
          完成
        </button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </div>
  );
}

function ChapterRow({
  node,
  onUpdated,
  onDeleted,
}: {
  node: Outline;
  onUpdated: (updated: Outline) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteOutline(node.id);
      onDeleted(node.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="group bg-card border border-border hover:border-primary/25 rounded-sm px-4 py-3 transition-colors duration-150 ml-6">
      {!editing ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono w-5 text-right flex-shrink-0">
                {node.order}
              </span>
              <span
                className="text-sm text-foreground cursor-pointer hover:text-primary transition-colors"
                onClick={() => setEditing(true)}
                title="点击编辑"
              >
                {node.title || '（无标题）'}
              </span>
              <StatusBadge status={node.status} />
            </div>
            {node.description && (
              <p className="mt-1 text-xs text-muted-foreground leading-snug pl-7 line-clamp-2">
                {node.description}
              </p>
            )}
          </div>
          <div
            className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmDelete ? (
              <>
                <span className="text-xs text-destructive mr-1">确认删除?</span>
                <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting}>是</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>否</Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                className="hover:text-destructive hover:bg-destructive/10"
                title="删除章节大纲"
              >
                <TrashIcon />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <InlineEditForm
          node={node}
          onSave={(updated) => { onUpdated(updated); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function QuickAddChapter({
  volumeId,
  nextOrder,
  onSaved,
  onCancel,
}: {
  volumeId: string;
  nextOrder: number;
  onSaved: (node: Outline) => void;
  onCancel: () => void;
}) {
  const { bookId } = useParams<{ bookId: string }>();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError('标题为必填项'); return; }
    setSaving(true); setError(null);
    try {
      const saved = await createOutline(bookId!, {
        type: 'chapter',
        parentId: volumeId,
        title: title.trim(),
        order: nextOrder,
        status: 'draft',
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-sm px-3 py-2.5 space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="章节大纲标题…"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '创建中…' : '创建'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </div>
  );
}

function QuickAddVolume({
  nextOrder,
  onSaved,
  onCancel,
}: {
  nextOrder: number;
  onSaved: (node: Outline) => void;
  onCancel: () => void;
}) {
  const { bookId } = useParams<{ bookId: string }>();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim()) { setError('标题为必填项'); return; }
    setSaving(true); setError(null);
    try {
      const saved = await createOutline(bookId!, {
        type: 'volume',
        parentId: null,
        title: title.trim(),
        order: nextOrder,
        status: 'draft',
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-sm px-3 py-2.5 space-y-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="卷标题…"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving ? '创建中…' : '创建'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </div>
  );
}

function VolumeSection({
  volume,
  children,
  onUpdated,
  onDeleted,
}: {
  volume: Outline;
  children: Outline[];
  onUpdated: (updated: Outline) => void;
  onDeleted: (id: string, isVolume: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingChapter, setAddingChapter] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteOutline(volume.id);
      onDeleted(volume.id, true);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="group bg-card border border-border hover:border-primary/25 rounded-sm px-4 py-3 transition-colors duration-150">
        {!editing ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="flex-shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                title={collapsed ? '展开' : '折叠'}
              >
                <span className={['inline-block transition-transform duration-150', collapsed ? '' : 'rotate-90'].join(' ')}>
                  <ChevronRightIcon />
                </span>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
                    onClick={() => setEditing(true)}
                    title="点击编辑"
                  >
                    {volume.title || '（无标题）'}
                  </span>
                  <StatusBadge status={volume.status} />
                  <span className="text-xs text-muted-foreground font-mono">
                    {children.length} 章
                  </span>
                </div>
                {volume.description && (
                  <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-2">
                    {volume.description}
                  </p>
                )}
              </div>
            </div>
            <div
              className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {confirmDelete ? (
                <>
                  <span className="text-xs text-destructive mr-1 whitespace-nowrap">
                    将同时删除 {children.length} 个章节大纲，确认?
                  </span>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={deleting}>是</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>否</Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(true)}
                  className="hover:text-destructive hover:bg-destructive/10"
                  title="删除卷（含所有章节大纲）"
                >
                  <TrashIcon />
                </Button>
              )}
            </div>
          </div>
        ) : (
          <InlineEditForm
            node={volume}
            onSave={(updated) => { onUpdated(updated); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        )}
      </div>

      {!collapsed && (
        <div className="space-y-1.5">
          {children.map((ch) => (
            <ChapterRow
              key={ch.id}
              node={ch}
              onUpdated={onUpdated}
              onDeleted={(id) => onDeleted(id, false)}
            />
          ))}
          <div className="ml-6">
            {addingChapter ? (
              <QuickAddChapter
                volumeId={volume.id}
                nextOrder={children.length + 1}
                onSaved={(node) => { onUpdated(node); setAddingChapter(false); }}
                onCancel={() => setAddingChapter(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingChapter(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors py-1.5 px-2"
              >
                <PlusIcon />
                新建章节大纲
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OutlinePage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { setPageContext } = useAIChat();

  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingVolume, setAddingVolume] = useState(false);

  useEffect(() => {
    setPageContext({ label: '故事大纲', pageKey: 'outline', meta: { bookId } });
    return () => setPageContext(null);
  }, [bookId, setPageContext]);

  async function loadOutlines() {
    if (!bookId) return;
    try {
      const data = await listOutlines(bookId);
      setOutlines((data.outlines ?? []).sort((a, b) => a.order - b.order));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    }
  }

  useEffect(() => {
    void loadOutlines().finally(() => setLoading(false));
  }, [bookId]);

  const volumes = outlines.filter((o) => o.type === 'volume').sort((a, b) => a.order - b.order);
  const chaptersByVolume = outlines
    .filter((o) => o.type === 'chapter')
    .reduce<Record<string, Outline[]>>((acc, ch) => {
      const key = ch.parentId ?? '__orphan__';
      if (!acc[key]) acc[key] = [];
      acc[key].push(ch);
      return acc;
    }, {});

  for (const key of Object.keys(chaptersByVolume)) {
    chaptersByVolume[key].sort((a, b) => a.order - b.order);
  }

  function handleUpdated(updated: Outline) {
    setOutlines((prev) => {
      const idx = prev.findIndex((o) => o.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [...prev, updated];
    });
  }

  function handleDeleted(id: string, isVolume: boolean) {
    setOutlines((prev) =>
      isVolume
        ? prev.filter((o) => o.id !== id && o.parentId !== id)
        : prev.filter((o) => o.id !== id)
    );
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }
  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-primary text-xs tracking-[0.16em] uppercase mb-1">故事结构</p>
          <h2 className="text-2xl text-foreground leading-tight">故事大纲</h2>
        </div>
        <Button type="button" onClick={() => setAddingVolume(true)} className="flex-shrink-0">
          <PlusIcon />
          新建卷
        </Button>
      </div>

      {volumes.length === 0 && !addingVolume ? (
        <div className="border border-dashed border-border rounded-sm p-12 text-center">
          <p className="italic text-muted-foreground text-lg">暂无大纲节点，可通过 AI 助手生成</p>
          <p className="text-muted-foreground text-sm mt-1">或点击右上角「新建卷」手动创建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {volumes.map((vol) => (
            <VolumeSection
              key={vol.id}
              volume={vol}
              children={chaptersByVolume[vol.id] ?? []}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      {addingVolume && (
        <QuickAddVolume
          nextOrder={volumes.length + 1}
          onSaved={(node) => { setOutlines((prev) => [...prev, node]); setAddingVolume(false); }}
          onCancel={() => setAddingVolume(false)}
        />
      )}
    </div>
  );
}

