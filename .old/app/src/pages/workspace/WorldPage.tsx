import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { useOutletContext } from 'react-router-dom';
import type { WorldSettingType, WorldSetting } from '../../types';
import {
  listWorldTypes,
  createWorldType,
  updateWorldType,
  deleteWorldType,
  listWorldSettings,
  deleteWorldSetting,
  initializeProjectWorld,
} from '../../api';
import { PlusIcon, EditIcon, TrashIcon } from '../../components/business/shared/Icons';
import { useAIChat } from '../../contexts/AIChatContext';
import type { AppLayoutContext } from '../../layouts/AppLayout';

type TypeFormData = { name: string; icon: string; description: string };

function TypeItem({
  type,
  active,
  count,
  onClick,
  onEdit,
  onDelete,
}: {
  type: WorldSettingType;
  active: boolean;
  count: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div
      className={[
        'group flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer transition-colors',
        active
          ? 'bg-primary/10 border border-primary/25'
          : 'hover:bg-accent border border-transparent',
      ].join(' ')}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0">{type.icon}</span>
        <span
          className={[
            'text-sm truncate',
            active ? 'text-primary' : 'text-muted-foreground',
          ].join(' ')}
        >
          {type.name}
        </span>
        <span className="flex-shrink-0 text-xs text-muted-foreground font-mono">
          {count}
        </span>
      </span>
      {!type.isPreset && (
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          {confirmDelete ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => { setConfirmDelete(false); onDelete(); }}
              >是</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >否</Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onEdit}
                title="编辑分类"
              >
                <EditIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                className="hover:text-destructive"
                title="删除分类"
              >
                <TrashIcon />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TypeDialog({
  open,
  onClose,
  editType,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editType: WorldSettingType | null;
  onSaved: (t: WorldSettingType) => void;
}) {
  const { bookId } = useParams<{ bookId: string }>();
  const [form, setForm] = useState<TypeFormData>({ name: '', icon: '📖', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editType
        ? { name: editType.name, icon: editType.icon, description: editType.description ?? '' }
        : { name: '', icon: '📖', description: '' });
      setError(null);
    }
  }, [open, editType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('名称为必填项'); return; }
    setSaving(true); setError(null);
    try {
      const input = { name: form.name.trim(), icon: form.icon, description: form.description.trim() || null };
      const saved = editType
        ? await updateWorldType(editType.id, input)
        : await createWorldType(bookId!, input);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const COMMON_ICONS = ['📖', '🌍', '⚙️', '📜', '🏛️', '🗺️', '🎭', '⚔️', '📝', '🔮', '💫', '🌙', '⚡', '🏔️', '🌊'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editType ? '编辑设定类型' : '新建设定类型'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <Label>图标</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, icon }))}
                  className={[
                    'text-lg w-9 h-9 flex items-center justify-center rounded-sm border transition-colors cursor-pointer bg-transparent',
                    form.icon === icon
                      ? 'border-primary/25 bg-primary/10'
                      : 'border-border hover:border-border',
                  ].join(' ')}
                >{icon}</button>
              ))}
            </div>
            <Input
              type="text"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder="或输入自定义 Emoji…"
              maxLength={4}
            />
          </div>
          <div>
            <Label>
              名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：魔法体系、门派势力…"
              autoFocus
            />
          </div>
          <div>
            <Label>说明</Label>
            <Input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="这个分类存放哪些设定？"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingCard({
  setting,
  onEdit,
  onDelete,
}: {
  setting: WorldSetting;
  onEdit: (s: WorldSetting) => void;
  onDelete: (s: WorldSetting) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tags = (() => { try { return JSON.parse(setting.tags) as string[]; } catch { return []; } })();
  const dateStr = new Date(setting.updatedAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });

  return (
    <div className="group relative bg-card border border-border hover:border-primary/25 rounded-sm transition-colors duration-150 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-foreground leading-snug">
          {setting.title}
        </span>
        <div
          className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-destructive mr-1">确认删除?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => { setConfirmDelete(false); onDelete(setting); }}
              >是</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >否</Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onEdit(setting)}
                title="编辑"
              ><EditIcon /></Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setConfirmDelete(true)}
                className="hover:text-destructive hover:bg-destructive/10"
                title="删除"
              ><TrashIcon /></Button>
            </>
          )}
        </div>
      </div>
      {setting.summary && (
        <p className="mt-1.5 text-sm text-muted-foreground leading-snug">
          {setting.summary}
        </p>
      )}
      {setting.content && !setting.summary && (
        <p className="mt-1.5 text-sm text-muted-foreground leading-snug line-clamp-2">
          {setting.content}
        </p>
      )}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 border border-border rounded-sm text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground font-mono">更新于 {dateStr}</p>
    </div>
  );
}

export function WorldPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { projects, refreshProjects } = useOutletContext<AppLayoutContext>();
  const { setPageContext } = useAIChat();

  const [types, setTypes] = useState<WorldSettingType[]>([]);
  const [settings, setSettings] = useState<WorldSetting[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<string | null>(() =>
    sessionStorage.getItem(`world-active-type-${bookId ?? ''}`) ?? null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<WorldSettingType | null>(null);
  const [initializing, setInitializing] = useState(false);

  const project = projects.find((item) => item.id === bookId);
  const worldInitStatus = project?.worldInitStatus ?? 'idle';
  const worldInitError = project?.worldInitError ?? null;

  useEffect(() => {
    if (activeTypeId) sessionStorage.setItem(`world-active-type-${bookId ?? ''}`, activeTypeId);
  }, [activeTypeId, bookId]);

  async function loadTypes() {
    try {
      const data = await listWorldTypes(bookId!);
      const list = data.types ?? [];
      setTypes(list);
      setActiveTypeId((prevId) => {
        if (prevId && list.some((t) => t.id === prevId)) return prevId;
        if (list.length > 0) return list[0].id;
        return null;
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    }
  }

  async function loadSettings(typeId: string) {
    try {
      const data = await listWorldSettings(bookId!, typeId);
      setSettings(data.settings ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    }
  }

  async function triggerWorldInit() {
    if (!bookId || initializing) return;
    setInitializing(true);
    try {
      await initializeProjectWorld(bookId);
    } catch {
      void 0;
    } finally {
      await refreshProjects();
      await loadTypes();
      setInitializing(false);
    }
  }

  useEffect(() => {
    void loadTypes().finally(() => setLoading(false));
  }, [bookId]);

  useEffect(() => {
    if (activeTypeId) void loadSettings(activeTypeId);
  }, [activeTypeId]);

  function handleTypeDeleted(typeId: string) {
    setTypes((prev) => prev.filter((t) => t.id !== typeId));
    if (activeTypeId === typeId) {
      const remaining = types.filter((t) => t.id !== typeId);
      setActiveTypeId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  async function deleteType(typeId: string) {
    try {
      await deleteWorldType(typeId);
      handleTypeDeleted(typeId);
    } catch { }
  }

  function handleTypeSaved(t: WorldSettingType) {
    setTypes((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
      return [...prev, t];
    });
    setActiveTypeId(t.id);
  }

  async function deleteSetting(setting: WorldSetting) {
    try {
      await deleteWorldSetting(setting.id);
      setSettings((prev) => prev.filter((s) => s.id !== setting.id));
    } catch { }
  }

  const activeType = types.find((t) => t.id === activeTypeId) ?? null;
  const countByType = types.reduce<Record<string, number>>((acc, t) => {
    acc[t.id] = 0;
    return acc;
  }, {});

  useEffect(() => {
    const label = activeType
      ? `世界设定 · ${activeType.icon} ${activeType.name}`
      : '世界设定';
    setPageContext({
      label,
      pageKey: 'world',
      meta: {
        bookId,
        typeId: activeTypeId ?? undefined,
        typeName: activeType?.name ?? undefined,
        typeIcon: activeType?.icon ?? undefined,
      },
      recommendedAgentHint: '世界',
    });
    return () => setPageContext(null);
  }, [activeTypeId, activeType, bookId]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }
  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div className="flex gap-0 h-full min-h-0" style={{ minHeight: 'calc(100vh - 8rem)' }}>
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-border pr-4 mr-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground tracking-wide uppercase">设定分类</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => { setEditingType(null); setTypeDialogOpen(true); }}
            title="新建分类"
          >
            <PlusIcon />
          </Button>
        </div>
        <div className="space-y-0.5 flex-1 overflow-y-auto">
          {types.map((t) => (
            <TypeItem
              key={t.id}
              type={t}
              active={t.id === activeTypeId}
              count={t.id === activeTypeId ? settings.length : (countByType[t.id] ?? 0)}
              onClick={() => setActiveTypeId(t.id)}
              onEdit={() => { setEditingType(t); setTypeDialogOpen(true); }}
              onDelete={() => void deleteType(t.id)}
            />
          ))}
          {types.length === 0 && (
            <div className="px-2 py-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {worldInitStatus === 'running'
                  ? 'AI 正在生成分类…'
                  : worldInitStatus === 'failed'
                    ? 'AI 初始化失败'
                    : '暂无分类'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void triggerWorldInit()}
                disabled={initializing || worldInitStatus === 'running'}
                className="w-full justify-center"
              >
                {initializing || worldInitStatus === 'running' ? '初始化中…' : '让 AI 生成分类'}
              </Button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-end justify-between mb-5">
          <div>
            <p className="text-primary text-xs tracking-[0.16em] uppercase mb-1">
              世界设定
            </p>
            <h2 className="text-2xl text-foreground leading-tight flex items-center gap-2">
              {activeType ? <><span>{activeType.icon}</span><span>{activeType.name}</span></> : '请选择分类'}
            </h2>
            {activeType?.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{activeType.description}</p>
            )}
          </div>
          {activeTypeId && (
            <Button
              type="button"
              onClick={() => navigate(`settings/new?typeId=${activeTypeId}`)}
              className="flex-shrink-0"
            >
              <PlusIcon />
              新建设定
            </Button>
          )}
        </div>

        {!activeTypeId ? (
          <div className="border border-dashed border-border rounded-sm p-12 text-center">
            <p className="italic text-muted-foreground text-lg">
              {worldInitStatus === 'running'
                ? 'AI 正在为这本书生成设定分类'
                : '从左侧选择或新建一个分类'}
            </p>
            {worldInitError && (
              <p className="text-destructive text-sm mt-2">{worldInitError}</p>
            )}
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void triggerWorldInit()}
                disabled={initializing || worldInitStatus === 'running'}
              >
                {initializing || worldInitStatus === 'running' ? '初始化中…' : '让 AI 自动生成'}
              </Button>
              <Button
                type="button"
                onClick={() => { setEditingType(null); setTypeDialogOpen(true); }}
              >
                手动新建分类
              </Button>
            </div>
          </div>
        ) : settings.length === 0 ? (
          <div className="border border-dashed border-border rounded-sm p-12 text-center">
            <p className="italic text-muted-foreground text-lg">此分类下暂无设定</p>
            <p className="text-muted-foreground text-sm mt-1">点击右上角「新建设定」开始填写</p>
          </div>
        ) : (
          <div className="space-y-2">
            {settings.map((s) => (
              <SettingCard
                key={s.id}
                setting={s}
                onEdit={(s) => navigate(`settings/${s.id}`, { state: { setting: s } })}
                onDelete={(s) => void deleteSetting(s)}
              />
            ))}
          </div>
        )}
      </main>

      <TypeDialog
        open={typeDialogOpen}
        onClose={() => setTypeDialogOpen(false)}
        editType={editingType}
        onSaved={handleTypeSaved}
      />
    </div>
  );
}
