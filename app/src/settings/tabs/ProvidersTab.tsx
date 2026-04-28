import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RiAddLine,
  RiPencilLine,
  RiDeleteBin6Line,
  RiPlayLine,
  RiLoader4Line,
  RiCheckLine,
  RiErrorWarningLine,
  RiDownloadCloud2Line,
} from '@remixicon/react';
import type { ProviderConfig, ProviderKind } from '../types';
import { makeConfigApi } from '../api';
import type { TestState } from './_shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
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

function makeProviderSchema(existingIds: string[], mode: 'add' | 'edit', currentId?: string) {
  const takenIds = mode === 'edit' ? existingIds.filter((id) => id !== currentId) : existingIds;
  return z.object({
    id: z
      .string()
      .min(1, 'ID 不能为空')
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'ID 只能包含小写字母、数字、横线')
      .refine((v) => !takenIds.includes(v), 'ID 已被其他服务商使用'),
    label: z.string().trim().min(1, '名称不能为空'),
    kind: z.enum(['openai', 'openai-compatible']),
    baseUrl: z
      .string()
      .optional()
      .refine(
        (v) =>
          !v ||
          (() => {
            try {
              new URL(v);
              return true;
            } catch {
              return false;
            }
          })(),
        '请输入合法的 URL',
      ),
    apiKey: mode === 'add' ? z.string().min(1, 'API Key 不能为空') : z.string().optional(),
  });
}

type ProviderFormValues = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
};

const FORM_ID = 'provider-edit-form';

function ModelRow({
  providerId,
  model,
  testState,
  onTest,
  onRemove,
}: {
  providerId: string;
  model: string;
  testState?: TestState;
  onTest: (model: string) => void;
  onRemove: (model: string) => void;
}) {
  const running = testState?.state === 'running';
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <span className="flex-1 min-w-0 text-sm text-neutral-200 truncate font-mono">{model}</span>
      {testState?.state === 'ok' && (
        <span className="text-xs text-emerald-400 flex items-center gap-1 truncate max-w-[140px]">
          <RiCheckLine className="size-3.5 shrink-0" />
          <span className="truncate">{testState.msg}</span>
        </span>
      )}
      {testState?.state === 'fail' && (
        <span className="text-xs text-red-400 flex items-center gap-1 truncate max-w-[140px]">
          <RiErrorWarningLine className="size-3.5 shrink-0" />
          <span className="truncate">{testState.msg}</span>
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onTest(model)}
        disabled={running}
        aria-label="测试"
      >
        {running ? (
          <RiLoader4Line className="size-3.5 animate-spin" />
        ) : (
          <RiPlayLine className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(model)}
        aria-label="删除"
        className="text-neutral-400 hover:text-red-400 hover:bg-red-950/40"
      >
        <RiDeleteBin6Line className="size-3.5" />
      </Button>
      <span className="hidden">{providerId}</span>
    </div>
  );
}

function ProviderEditForm({
  defaultValues,
  initialModels,
  existingApiKey,
  mode,
  existingIds,
  currentId,
  tests,
  onTest,
  api,
  onValid,
}: {
  defaultValues: ProviderFormValues;
  initialModels: string[];
  existingApiKey?: string;
  mode: 'add' | 'edit';
  existingIds: string[];
  currentId?: string;
  tests: Record<string, TestState>;
  onTest: (
    providerId: string,
    model: string,
    inline: { baseUrl?: string; apiKey?: string },
  ) => void;
  api: ReturnType<typeof makeConfigApi>;
  onValid: (values: ProviderFormValues, models: string[]) => void;
}) {
  const schema = useMemo(
    () => makeProviderSchema(existingIds, mode, currentId),
    [existingIds, mode, currentId],
  );

  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const [models, setModels] = useState<string[]>(initialModels);
  const [modelInput, setModelInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const watchedId = form.watch('id');
  const watchedBaseUrl = form.watch('baseUrl');
  const watchedApiKey = form.watch('apiKey');

  function effectiveInline(): { baseUrl?: string; apiKey?: string } {
    return {
      baseUrl: watchedBaseUrl?.trim() || undefined,
      apiKey: watchedApiKey?.trim() || existingApiKey,
    };
  }

  function addModel(name: string) {
    const m = name.trim();
    if (!m) return;
    setModels((prev) => (prev.includes(m) ? prev : [...prev, m]));
    setModelInput('');
  }

  function removeModel(name: string) {
    setModels((prev) => prev.filter((m) => m !== name));
  }

  async function fetchModels() {
    const inline = effectiveInline();
    if (!inline.apiKey) {
      setFetchError('请先填写 API Key');
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const r = await api.listProviderModels(watchedId || 'inline', inline);
      if (!r.ok) {
        setFetchError(r.error ?? '拉取失败');
        return;
      }
      const fetched = r.models ?? [];
      setModels((prev) => {
        const set = new Set(prev);
        for (const m of fetched) set.add(m);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      });
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  }

  function testModel(model: string) {
    const inline = effectiveInline();
    onTest(watchedId || 'inline', model, inline);
  }

  return (
    <Form {...form}>
      <form
        id={FORM_ID}
        onSubmit={form.handleSubmit((v) => onValid(v, models))}
        className="space-y-4"
        autoComplete="off"
      >
        {/* Honeypot fields to absorb browser autofill heuristics */}
        <div aria-hidden className="hidden">
          <input type="text" name="username" tabIndex={-1} autoComplete="username" />
          <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    name="provider-identifier"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    name="provider-display-name"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>类型</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="openai">openai</SelectItem>
                  <SelectItem value="openai-compatible">openai-compatible</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Base URL</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  name="provider-endpoint"
                  placeholder="留空使用官方默认地址"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="apiKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>API Key</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  name="provider-secret"
                  placeholder={mode === 'edit' ? '留空保持原值' : 'sk-...'}
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2 pt-1 border-t border-neutral-800/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">模型列表</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchModels()}
              disabled={fetching}
              title="使用当前表单的 Base URL 与 API Key 拉取"
            >
              {fetching ? (
                <RiLoader4Line className="size-3.5 animate-spin" />
              ) : (
                <RiDownloadCloud2Line className="size-3.5" />
              )}
              获取列表
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addModel(modelInput);
                }
              }}
              placeholder="手动输入模型名后回车或点 +"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              name="provider-model-input"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addModel(modelInput)}
              disabled={!modelInput.trim()}
            >
              <RiAddLine className="size-3.5" /> 添加
            </Button>
          </div>

          {fetchError && <div className="text-xs text-destructive">{fetchError}</div>}

          <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800 max-h-56 overflow-y-auto">
            {models.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                暂无模型，可手动添加或保存后从服务商获取。
              </div>
            ) : (
              models.map((m) => {
                const key = `${watchedId || 'inline'}::${m}`;
                return (
                  <ModelRow
                    key={m}
                    providerId={watchedId || 'inline'}
                    model={m}
                    testState={tests[key]}
                    onTest={testModel}
                    onRemove={removeModel}
                  />
                );
              })
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

type EditTarget =
  | { mode: 'add' }
  | { mode: 'edit'; idx: number; currentId: string };

function getLatestTest(tests: Record<string, TestState>, providerId: string): TestState | null {
  const entries = Object.entries(tests).filter(([k]) => k.startsWith(`${providerId}::`));
  if (entries.length === 0) return null;
  return entries[entries.length - 1][1];
}

function TestBadge({ state }: { state: TestState }) {
  if (state.state === 'running')
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <RiLoader4Line className="size-3.5 animate-spin" /> 测试中
      </Badge>
    );
  if (state.state === 'ok')
    return (
      <Badge variant="outline" className="gap-1 border-emerald-800 text-emerald-400">
        <RiCheckLine className="size-3.5" /> 连通
      </Badge>
    );
  if (state.state === 'fail')
    return (
      <Badge variant="outline" className="gap-1 border-red-900 text-red-400">
        <RiErrorWarningLine className="size-3.5" /> 失败
      </Badge>
    );
  return null;
}

export function ProvidersTab({
  providers,
  tests,
  saving,
  onPersist,
  onTest,
  api,
}: {
  providers: ProviderConfig[];
  tests: Record<string, TestState>;
  saving: boolean;
  onPersist: (next: ProviderConfig[]) => Promise<void> | void;
  onTest: (
    providerId: string,
    model: string,
    inline?: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> },
  ) => void;
  api: ReturnType<typeof makeConfigApi>;
}) {
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [deleteInput, setDeleteInput] = useState('');

  const existingIds = providers.map((p) => p.id);

  function openAdd() {
    setEditTarget({ mode: 'add' });
  }

  function openEdit(idx: number) {
    setEditTarget({ mode: 'edit', idx, currentId: providers[idx].id });
  }

  async function handleValid(values: ProviderFormValues, models: string[]) {
    if (!editTarget) return;
    let next: ProviderConfig[];
    if (editTarget.mode === 'add') {
      next = [
        ...providers,
        {
          id: values.id,
          label: values.label,
          kind: values.kind,
          baseUrl: values.baseUrl || undefined,
          apiKey: values.apiKey || undefined,
          models,
        },
      ];
    } else {
      next = providers.map((p, i) => {
        if (i !== editTarget.idx) return p;
        const merged: ProviderConfig = {
          ...p,
          id: values.id,
          label: values.label,
          kind: values.kind,
          baseUrl: values.baseUrl || undefined,
          models,
        };
        if (values.apiKey) merged.apiKey = values.apiKey;
        return merged;
      });
    }
    setEditTarget(null);
    await onPersist(next);
  }

  async function handleRemove(idx: number) {
    const next = providers.filter((_, i) => i !== idx);
    await onPersist(next);
  }

  function openDelete(idx: number) {
    setDeleteIdx(idx);
    setDeleteInput('');
  }

  function closeDelete() {
    setDeleteIdx(null);
    setDeleteInput('');
  }

  async function confirmDelete() {
    if (deleteIdx === null) return;
    const idx = deleteIdx;
    closeDelete();
    await handleRemove(idx);
  }

  const deleteTarget = deleteIdx !== null ? providers[deleteIdx] : null;
  const deleteConfirmable =
    deleteTarget !== null && deleteInput.trim() === deleteTarget.id;

  const editDefaults: ProviderFormValues =
    editTarget?.mode === 'edit'
      ? {
          id: providers[editTarget.idx].id,
          label: providers[editTarget.idx].label,
          kind: providers[editTarget.idx].kind,
          baseUrl: providers[editTarget.idx].baseUrl ?? '',
          apiKey: '',
        }
      : { id: '', label: '', kind: 'openai', baseUrl: '', apiKey: '' };

  const editInitialModels: string[] =
    editTarget?.mode === 'edit' ? providers[editTarget.idx].models ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">服务商</h2>
          <div className="text-xs text-muted-foreground mt-0.5">配置可用的模型 API 服务商</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={openAdd} disabled={saving}>
            <RiAddLine className="size-3.5" /> 新增
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
        {providers.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">
            暂无服务商，点击「新增」开始配置。
          </div>
        )}
        {providers.map((p, idx) => {
          const latestTest = getLatestTest(tests, p.id);
          const modelCount = p.models?.length ?? 0;
          return (
            <div key={`${p.id}-${idx}`} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-neutral-200 truncate">{p.label}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.id} · {p.kind} · {modelCount} 模型
                  {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                </div>
              </div>
              {latestTest && <TestBadge state={latestTest} />}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => openEdit(idx)}
                aria-label="编辑"
              >
                <RiPencilLine className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => openDelete(idx)}
                aria-label="删除"
                className="text-neutral-400 hover:text-red-400 hover:bg-red-950/40"
              >
                <RiDeleteBin6Line className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {editTarget?.mode === 'add' ? '新增服务商' : '编辑服务商'}
            </DialogTitle>
          </DialogHeader>

          {editTarget && (
            <ProviderEditForm
              key={editTarget.mode === 'edit' ? editTarget.currentId : 'add'}
              defaultValues={editDefaults}
              initialModels={editInitialModels}
              existingApiKey={
                editTarget.mode === 'edit' ? providers[editTarget.idx].apiKey : undefined
              }
              mode={editTarget.mode}
              existingIds={existingIds}
              currentId={editTarget.mode === 'edit' ? editTarget.currentId : undefined}
              tests={tests}
              onTest={onTest}
              api={api}
              onValid={handleValid}
            />
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button type="submit" form={FORM_ID}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteIdx !== null} onOpenChange={(o) => { if (!o) closeDelete(); }}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>删除服务商</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-300">
                即将删除服务商 <span className="font-medium text-red-400">{deleteTarget.label}</span>
                （<code className="text-xs">{deleteTarget.id}</code>）。此操作不可撤销。
              </p>
              <p className="text-xs text-muted-foreground">
                请输入服务商 ID <code className="text-neutral-300">{deleteTarget.id}</code> 以确认删除：
              </p>
              <Input
                autoFocus
                autoComplete="off"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deleteConfirmable) {
                    e.preventDefault();
                    void confirmDelete();
                  }
                }}
                placeholder={deleteTarget.id}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDelete}>取消</Button>
            <Button
              variant="destructive"
              disabled={!deleteConfirmable || saving}
              onClick={() => void confirmDelete()}
            >
              <RiDeleteBin6Line className="size-3.5" /> 确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
