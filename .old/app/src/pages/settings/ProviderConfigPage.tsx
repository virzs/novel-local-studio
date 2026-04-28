import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
} from '../../components/business/shared/Icons';
import { listProviders, deleteProvider, getProviderModels, createProvider, updateProvider } from '../../api';
import type { Provider } from '../../types';

type ModelCapability =
  | 'chat'
  | 'code'
  | 'long-context'
  | 'vision'
  | 'reasoning'
  | 'tools'
  | 'audio'
  | 'embedding';

const CAP_LABEL: Record<ModelCapability, string> = {
  chat: '聊天',
  code: '代码',
  'long-context': '长上下文',
  vision: '视觉',
  reasoning: '推理',
  tools: '工具',
  audio: '音频',
  embedding: '向量',
};

const CAP_CLASS: Record<ModelCapability, string> = {
  chat: 'border-sky-400/50 text-sky-500 dark:text-sky-400',
  code: 'border-teal-400/50 text-teal-500 dark:text-teal-400',
  'long-context': 'border-indigo-400/50 text-indigo-500 dark:text-indigo-400',
  vision: 'border-blue-400/50 text-blue-500 dark:text-blue-400',
  reasoning: 'border-violet-400/50 text-violet-500 dark:text-violet-400',
  tools: 'border-emerald-400/50 text-emerald-500 dark:text-emerald-400',
  audio: 'border-amber-400/50 text-amber-500 dark:text-amber-400',
  embedding: 'border-rose-400/50 text-rose-500 dark:text-rose-400',
};

const CAP_PRIORITY: ModelCapability[] = [
  'reasoning',
  'embedding',
  'audio',
  'code',
  'vision',
  'chat',
  'long-context',
];

function inferModelCapabilities(
  id: string,
  rawMeta?: Record<string, unknown>,
): ModelCapability[] {
  const caps = new Set<ModelCapability>();
  const lower = id.toLowerCase();

  if (rawMeta) {
    const details =
      typeof rawMeta['details'] === 'object' && rawMeta['details'] !== null
        ? (rawMeta['details'] as Record<string, unknown>)
        : undefined;
    const familiesSource = rawMeta['families'] ?? details?.['families'];
    const families = Array.isArray(familiesSource)
      ? familiesSource.filter((x): x is string => typeof x === 'string')
      : undefined;
    if (families) {
      for (const f of families) {
        if (/clip|vision/.test(f)) caps.add('vision');
      }
    }
    const rawCaps = rawMeta['capabilities'];
    if (Array.isArray(rawCaps)) {
      for (const c of rawCaps) {
        if (typeof c === 'string') {
          if (/vision|image/.test(c)) caps.add('vision');
          if (/tool|function/.test(c)) caps.add('tools');
          if (/embed/.test(c)) caps.add('embedding');
          if (/audio|speech|tts|asr/.test(c)) caps.add('audio');
        }
      }
    }
  }

  if (
    /vision|vl\b|visual|-v\b|gemini.*flash|gemini.*pro|gpt-4o|claude.*sonnet|claude.*opus|pixtral|llava|bakllava|moondream|cogvlm|internvl|qwen.*vl/.test(
      lower,
    )
  ) {
    caps.add('vision');
  }
  if (
    /o1|o3|o4|deepseek.*r|qwq|thinking|reasoner|reflection|skywork|sky-t|marco-o/.test(
      lower,
    )
  ) {
    caps.add('reasoning');
  }
  if (/embed|embedding|e5-|bge-|minilm|nomic-embed|text-embedding|ada-002/.test(lower)) {
    caps.add('embedding');
  }
  if (/whisper|tts|audio|speech|voice|sonic/.test(lower)) {
    caps.add('audio');
  }
  if (
    /gpt-4|gpt-3\.5|claude|gemini|mistral|llama.*instruct|qwen|deepseek.*chat|command/.test(
      lower,
    ) &&
    !/embed|whisper|tts/.test(lower)
  ) {
    caps.add('tools');
  }
  if (
    /chat|instruct|assistant|gpt-|claude|gemini|mistral|llama|qwen|deepseek|phi|command/.test(
      lower,
    ) &&
    !/embed|whisper|tts|audio/.test(lower)
  ) {
    caps.add('chat');
  }
  if (
    /code|coder|codestral|starcoder|deepseek.*coder|codellama|wizard.*code|granite.*code/.test(
      lower,
    )
  ) {
    caps.add('code');
  }
  if (
    /128k|200k|256k|1m|long|context.*large|gemini.*pro.*1\.5|gemini.*flash.*1\.5|claude.*3|longformer|yarn|rope|ext/.test(
      lower,
    )
  ) {
    caps.add('long-context');
  }

  return Array.from(caps);
}

function primaryCap(caps: ModelCapability[]): ModelCapability | null {
  for (const cap of CAP_PRIORITY) {
    if (caps.includes(cap)) return cap;
  }
  if (caps.length > 0) return caps[0];
  return null;
}

function groupModelsByPrimaryCap(
  models: string[],
): Array<{ cap: ModelCapability | null; label: string; items: string[] }> {
  const groups = new Map<string, { cap: ModelCapability | null; label: string; items: string[] }>();

  for (const id of models) {
    const caps = inferModelCapabilities(id);
    const cap = primaryCap(caps);
    const key = cap ?? '__other__';
    const label = cap ? CAP_LABEL[cap] : '其他';
    if (!groups.has(key)) groups.set(key, { cap, label, items: [] });
    groups.get(key)!.items.push(id);
  }

  const order: string[] = [...CAP_PRIORITY, '__other__'];
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([, v]) => v);
}

type FetchedModel = {
  id: string;
  caps: ModelCapability[];
};

function parseModels(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed))
      return parsed.filter((m): m is string => typeof m === 'string');
  } catch {
    return [];
  }
  return [];
}

type ProviderFormData = {
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
};

function CapBadge({ cap }: { cap: ModelCapability }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 font-sans font-medium leading-none h-[18px] ${CAP_CLASS[cap]}`}
    >
      {CAP_LABEL[cap]}
    </Badge>
  );
}

function ModelRowList({
  models,
  onRemove,
}: {
  models: string[];
  onRemove?: (id: string) => void;
}) {
  if (models.length === 0) {
    return <p className="text-xs text-muted-foreground italic py-1">暂无模型</p>;
  }

  const groups = groupModelsByPrimaryCap(models);

  return (
    <div className="flex flex-col border border-border rounded-sm overflow-hidden">
      {groups.map(({ cap, label, items }) => (
        <div key={cap ?? '__other__'}>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 border-b border-border/50">
            <span className="text-xs text-muted-foreground uppercase tracking-wider leading-none">
              {label}
            </span>
            <span className="text-xs text-muted-foreground font-mono leading-none">
              {items.length}
            </span>
          </div>
          {items.map((m) => {
            const caps = inferModelCapabilities(m);
            return (
              <div
                key={m}
                className={[
                  'flex items-center gap-2 px-2 py-2 border-b border-border/30 last:border-b-0',
                  onRemove ? 'group hover:bg-muted/20 transition-colors' : '',
                ].join(' ')}
              >
                <span className="text-sm font-mono text-foreground flex-1 truncate min-w-0">
                  {m}
                </span>
                <span className="flex items-center gap-0.5 shrink-0">
                  {caps.map((c) => <CapBadge key={c} cap={c} />)}
                </span>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    className="shrink-0 text-muted-foreground/40 hover:text-destructive border-0 bg-transparent cursor-pointer p-0 leading-none transition-colors opacity-0 group-hover:opacity-100 text-sm"
                    aria-label={`移除 ${m}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GroupedFetchedModelList({
  fetchedModels,
  addedIds,
  onAdd,
}: {
  fetchedModels: FetchedModel[];
  addedIds: string[];
  onAdd: (id: string) => void;
}) {
  const ids = fetchedModels.map((m) => m.id);
  const groups = groupModelsByPrimaryCap(ids);
  const capsById = new Map(fetchedModels.map((m) => [m.id, m.caps]));

  return (
    <div className="flex flex-col">
      {groups.map(({ cap, label, items }) => (
        <div key={cap ?? '__other__'}>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 border-b border-border/50">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">
              {label}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">
              {items.length}
            </span>
          </div>
          {items.map((id) => {
            const caps = capsById.get(id) ?? [];
            const added = addedIds.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onAdd(id)}
                disabled={added}
                className={[
                  'flex items-center gap-2 px-2 py-1.5 border-b border-border/30 last:border-b-0 text-left w-full transition-colors',
                  added
                    ? 'text-muted-foreground/50 cursor-default'
                    : 'hover:bg-muted/30 cursor-pointer',
                ].join(' ')}
              >
                <span className="shrink-0 w-3.5 text-[10px] text-muted-foreground">
                  {added ? '✓' : '+'}
                </span>
                <span className="text-xs font-mono flex-1 truncate min-w-0">
                  {id}
                </span>
                {caps.length > 0 && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    {caps.map((c) => <CapBadge key={c} cap={c} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ProviderFormDialog({
  open,
  provider,
  onClose,
  onSaved,
}: {
  open: boolean;
  provider: Provider | null;
  onClose: () => void;
  onSaved: (saved: Provider) => void;
}) {
  const isCreate = provider === null;
  const isPreset = provider?.isPreset === 1;

  const [form, setForm] = useState<ProviderFormData>({
    name: '',
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    models: [],
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [manualModel, setManualModel] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      name: provider?.name ?? '',
      type: provider?.type ?? 'openai-compatible',
      baseUrl: provider?.baseUrl ?? '',
      apiKey: provider?.apiKey ?? '',
      models: provider ? parseModels(provider.models) : [],
    });
    setSaveError(null);
    setFetchModelsError(null);
    setFetchedModels([]);
    setManualModel('');
    setShowApiKey(false);
  }, [open, provider?.id]);

  async function handleFetchModels() {
    setFetchingModels(true);
    setFetchModelsError(null);
    setFetchedModels([]);
    try {
      let data: unknown;
      if (!isCreate && provider) {
        data = await getProviderModels(provider.id);
      } else {
        const url = form.baseUrl.replace(/\/$/, '') + '/models';
        const headers: Record<string, string> = {};
        if (form.apiKey.trim()) {
          headers['Authorization'] = `Bearer ${form.apiKey.trim()}`;
        }
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`获取失败 (${res.status})`);
        data = await res.json();
      }

      const asRecord = data as Record<string, unknown>;
      const fetched: FetchedModel[] = [];

      if (Array.isArray(asRecord['data'])) {
        for (const m of asRecord['data'] as Record<string, unknown>[]) {
          const id = typeof m['id'] === 'string' ? m['id'] : '';
          if (!id) continue;
          fetched.push({ id, caps: inferModelCapabilities(id, m) });
        }
      } else if (Array.isArray(asRecord['models'])) {
        for (const m of asRecord['models'] as Record<string, unknown>[]) {
          const id =
            (typeof m['name'] === 'string' ? m['name'] : '') ||
            (typeof m['model'] === 'string' ? m['model'] : '');
          if (!id) continue;
          fetched.push({ id, caps: inferModelCapabilities(id, m) });
        }
      }

      if (fetched.length === 0) throw new Error('未找到模型，响应格式不支持');
      setFetchedModels(fetched);
    } catch (err) {
      setFetchModelsError(err instanceof Error ? err.message : '获取失败');
    } finally {
      setFetchingModels(false);
    }
  }

  function addFetchedModel(id: string) {
    if (!form.models.includes(id)) {
      setForm((f) => ({ ...f, models: [...f.models, id] }));
    }
  }

  function addAllFetchedModels() {
    setForm((f) => ({
      ...f,
      models: Array.from(new Set([...f.models, ...fetchedModels.map((m) => m.id)])),
    }));
  }

  function removeModel(id: string) {
    setForm((f) => ({ ...f, models: f.models.filter((m) => m !== id) }));
  }

  function handleAddManual() {
    const trimmed = manualModel.trim();
    if (!trimmed) return;
    if (!form.models.includes(trimmed)) {
      setForm((f) => ({ ...f, models: [...f.models, trimmed] }));
    }
    setManualModel('');
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSaveError('名称为必填项');
      return;
    }
    if (!form.baseUrl.trim()) {
      setSaveError('Base URL 为必填项');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        baseUrl: form.baseUrl.trim(),
        models: JSON.stringify(form.models),
      };
      if (form.apiKey.trim()) {
        body['apiKey'] = form.apiKey.trim();
      }

      let saved: Provider;
      if (!isCreate && provider) {
        saved = await updateProvider(
          provider.id,
          body as Parameters<typeof updateProvider>[1],
        );
      } else {
        saved = await createProvider(body as Parameters<typeof createProvider>[0]);
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>
            {isCreate ? '新建服务商' : `编辑 · ${provider?.name ?? ''}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          <div>
            <Label className="mb-1.5 block">
              名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="服务商名称"
              disabled={isPreset}
            />
          </div>

          <div>
            <Label className="mb-1.5 block">类型</Label>
            <Select
              value={form.type}
              onValueChange={(val) => setForm((f) => ({ ...f, type: val }))}
              disabled={isPreset}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai-compatible">openai-compatible</SelectItem>
                <SelectItem value="ollama">ollama</SelectItem>
                <SelectItem value="custom">custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">
              Base URL <span className="text-destructive">*</span>
            </Label>
            <Input
              type="text"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              className="font-mono"
              placeholder="https://api.openai.com/v1"
              disabled={isPreset}
            />
          </div>

          <div>
            <Label className="mb-1.5 block">API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                className="pr-9 font-mono"
                placeholder="sk-…"
                disabled={isPreset}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5"
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
            {!isCreate && !isPreset && (
              <p className="mt-1 text-xs text-muted-foreground">留空则不修改 API Key</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="mb-0">
                模型列表
                <span className="ml-1.5 text-[10px] text-muted-foreground font-normal font-mono">
                  {form.models.length}
                </span>
              </Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => void handleFetchModels()}
                disabled={fetchingModels || !form.baseUrl.trim()}
                className="text-xs h-auto p-0"
              >
                {fetchingModels ? '获取中…' : '从服务商获取'}
              </Button>
            </div>

            {fetchModelsError && (
              <p className="mb-2 text-xs text-destructive">{fetchModelsError}</p>
            )}

            {fetchedModels.length > 0 && (
              <div className="mb-3 border border-border rounded-sm overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1.5 bg-muted/60 border-b border-border">
                  <span className="text-xs text-muted-foreground">
                    已获取 {fetchedModels.length} 个模型
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={addAllFetchedModels}
                    className="text-xs h-auto p-0"
                  >
                    全部添加
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <GroupedFetchedModelList
                    fetchedModels={fetchedModels}
                    addedIds={form.models}
                    onAdd={addFetchedModel}
                  />
                </div>
              </div>
            )}

            <div className="mb-2">
              <ModelRowList models={form.models} onRemove={removeModel} />
            </div>

            <div className="flex gap-2">
              <Input
                type="text"
                value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManual();
                  }
                }}
                className="flex-1 py-1.5 text-xs font-mono"
                placeholder="手动输入模型 ID"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddManual}
                disabled={!manualModel.trim()}
              >
                添加
              </Button>
            </div>
          </div>

          {saveError && <p className="text-destructive text-sm">{saveError}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || isPreset}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProviderReadOnlyPanel({
  provider,
  onEdit,
  onDelete,
}: {
  provider: Provider;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isPreset = provider.isPreset === 1;
  const hasKey = provider.apiKey !== null && provider.apiKey.length > 0;
  const models = parseModels(provider.models);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-foreground leading-tight truncate">
              {provider.name}
            </h2>
            {isPreset && (
              <Badge variant="default" className="text-[9px] tracking-wide uppercase shrink-0 px-1 py-0 h-4">
                预设
              </Badge>
            )}
          </div>
          <p className="text-sm font-mono text-muted-foreground truncate">
            {provider.baseUrl}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            title="编辑"
          >
            <EditIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={isPreset}
            className={
              isPreset
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:text-destructive hover:bg-destructive/10'
            }
            title={isPreset ? '预设不可删除' : '删除'}
          >
            <TrashIcon />
          </Button>
        </div>
      </div>

      <Separator className="mb-4" />

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-5">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">类型</p>
          <span className="text-sm font-mono text-foreground border border-border rounded-sm px-1.5 py-0.5">
            {provider.type}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">API Key</p>
          {hasKey ? (
            <span className="text-sm text-success">● 已配置</span>
          ) : (
            <span className="text-sm text-muted-foreground italic">未配置</span>
          )}
        </div>
      </div>

      <Separator className="mb-4" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            模型列表
            <span className="ml-2 font-mono normal-case">{models.length} 个</span>
          </p>
        </div>
        <ModelRowList models={models} />
      </div>
    </div>
  );
}

function EmptyDetailPanel({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
      <p className="text-muted-foreground text-sm">从左侧选择服务商查看详情</p>
      <p className="text-muted-foreground text-xs">或</p>
      <Button variant="outline" size="sm" onClick={onCreateNew}>
        <PlusIcon />
        新建服务商
      </Button>
    </div>
  );
}

function ProviderListItem({
  provider,
  selected,
  onClick,
}: {
  provider: Provider;
  selected: boolean;
  onClick: () => void;
}) {
  const isPreset = provider.isPreset === 1;
  const hasKey = provider.apiKey !== null && provider.apiKey.length > 0;
  const models = parseModels(provider.models);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full text-left px-3 py-2.5 rounded-sm transition-colors cursor-pointer border',
        selected
          ? 'bg-accent border-border text-foreground'
          : 'bg-transparent border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-sm font-medium text-foreground truncate flex-1 leading-snug">
          {provider.name}
        </span>
        {isPreset && (
          <Badge
            variant="default"
            className="text-[9px] tracking-wide uppercase shrink-0 px-1 py-0 h-4"
          >
            预设
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground">
          {provider.type}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {models.length} 模型
        </span>
        {hasKey && (
          <span className="text-[10px] text-success ml-auto">● Key</span>
        )}
      </div>
    </button>
  );
}


export function ProviderConfigPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogProvider, setDialogProvider] = useState<Provider | null>(null);
  const [confirmDeleteProvider, setConfirmDeleteProvider] = useState<Provider | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadProviders() {
    try {
      const data = await listProviders();
      setProviders(data.providers ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !providers.some((p) => p.id === selectedId)) {
      setSelectedId(providers[0].id);
    }
  }, [providers, selectedId]);

  const selectedProvider = providers.find((p) => p.id === selectedId) ?? null;

  const filteredProviders = providers.filter((p) => {
    return p.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  useEffect(() => {
    if (filteredProviders.length === 0) return;
    if (!selectedId || !filteredProviders.some((provider) => provider.id === selectedId)) {
      setSelectedId(filteredProviders[0].id);
    }
  }, [filteredProviders, selectedId]);

  function openCreate() {
    setDialogProvider(null);
    setDialogOpen(true);
  }

  function openEdit(provider: Provider) {
    setDialogProvider(provider);
    setDialogOpen(true);
  }

  async function handleSaved(saved: Provider) {
    await loadProviders();
    setSelectedId(saved.id);
  }

  async function handleDelete(provider: Provider) {
    if (provider.isPreset === 1) return;
    setDeleteError(null);
    try {
      await deleteProvider(provider.id);
      const remaining = providers.filter((p) => p.id !== provider.id);
      setSelectedId(remaining.length > 0 ? remaining[0].id : null);
      await loadProviders();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div className="flex gap-0 h-[calc(100vh-120px)] min-h-0">
      <div className="w-56 shrink-0 flex flex-col border-r border-border pr-3 mr-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索服务商…"
            className="h-7 text-xs flex-1 py-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={openCreate}
            title="新建服务商"
          >
            <PlusIcon />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-0.5">
          {filteredProviders.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center mt-6">
              {providers.length === 0 ? '暂无服务商' : '无匹配结果'}
            </p>
          ) : (
            filteredProviders.map((p) => (
              <ProviderListItem
                key={p.id}
                provider={p}
                selected={selectedId === p.id}
                onClick={() => setSelectedId(p.id)}
              />
            ))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto pl-1">
        {deleteError && (
          <p className="mb-4 text-destructive text-sm">{deleteError}</p>
        )}

        {selectedProvider ? (
          <ProviderReadOnlyPanel
            provider={selectedProvider}
            onEdit={() => openEdit(selectedProvider)}
            onDelete={() => setConfirmDeleteProvider(selectedProvider)}
          />
        ) : (
          <EmptyDetailPanel onCreateNew={openCreate} />
        )}
      </div>

      <ProviderFormDialog
        open={dialogOpen}
        provider={dialogProvider}
        onClose={() => setDialogOpen(false)}
        onSaved={(saved) => void handleSaved(saved)}
      />

      <AlertDialog
        open={confirmDeleteProvider !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteProvider(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除服务商</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除服务商「{confirmDeleteProvider?.name}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDeleteProvider) {
                  void handleDelete(confirmDeleteProvider);
                  setConfirmDeleteProvider(null);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
