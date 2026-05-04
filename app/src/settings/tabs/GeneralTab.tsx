import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RiPencilLine } from '@remixicon/react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { ModelCombobox } from './_shared';
import type { Bindings, ProviderConfig } from '../types';
import { makeConfigApi } from '../api';
import {
  LOCAL_EMBEDDING_PRESETS,
  DEFAULT_LOCAL_EMBEDDING_PRESET,
  findLocalEmbeddingPreset,
} from '../embedding-presets';

const EMBEDDING_FORM_ID = 'embedding-edit-form';

type EmbeddingFormValues = {
  providerId: string;
  model: string;
  dimension: number;
};

function makeEmbeddingSchema(providerIds: string[]) {
  return z.object({
    providerId: z
      .string()
      .min(1, '请选择服务商')
      .refine((v) => providerIds.length === 0 || providerIds.includes(v), '请选择服务商'),
    model: z.string().trim().min(1, '请输入或选择模型'),
    dimension: z
      .number({ invalid_type_error: '维度必须是正整数' })
      .int('维度必须是正整数')
      .positive('维度必须是正整数'),
  });
}

function resolveDefaultEmbeddingValues(
  values: EmbeddingFormValues,
  providers: ProviderConfig[],
): EmbeddingFormValues {
  const provider = providers.find((p) => p.id === values.providerId);
  if (provider?.kind === 'local-onnx' && !findLocalEmbeddingPreset(values.model)) {
    return {
      ...values,
      model: DEFAULT_LOCAL_EMBEDDING_PRESET.modelId,
      dimension: DEFAULT_LOCAL_EMBEDDING_PRESET.dimension,
    };
  }
  return values;
}

function EmbeddingEditForm({
  defaultValues,
  providers,
  api,
  onValid,
}: {
  defaultValues: EmbeddingFormValues;
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  onValid: (values: EmbeddingFormValues) => void;
}) {
  const providerIds = providers.map((p) => p.id);
  const schema = useMemo(() => makeEmbeddingSchema(providerIds), [providerIds]);

  const resolvedDefaults = resolveDefaultEmbeddingValues(defaultValues, providers);

  const form = useForm<EmbeddingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: resolvedDefaults,
  });

  const watchedProviderId = form.watch('providerId');
  const watchedModel = form.watch('model');
  const selectedProvider = providers.find((p) => p.id === watchedProviderId);
  const isLocalOnnx = selectedProvider?.kind === 'local-onnx';

  const activePreset = isLocalOnnx
    ? (findLocalEmbeddingPreset(watchedModel) ?? DEFAULT_LOCAL_EMBEDDING_PRESET)
    : null;

  const nonLocalModelGroups = providers
    .filter((p) => p.kind !== 'local-onnx')
    .map((p) => ({
      providerId: p.id,
      providerLabel: p.label,
      models: p.models ?? [],
    }));

  function handleProviderChange(pid: string) {
    form.setValue('providerId', pid, { shouldValidate: true });
    const next = providers.find((p) => p.id === pid);
    if (next?.kind === 'local-onnx') {
      form.setValue('model', DEFAULT_LOCAL_EMBEDDING_PRESET.modelId, { shouldValidate: true });
      form.setValue('dimension', DEFAULT_LOCAL_EMBEDDING_PRESET.dimension, { shouldValidate: true });
    } else {
      form.setValue('model', '', { shouldValidate: false });
      form.setValue('dimension', 1536, { shouldValidate: false });
    }
  }

  function handleLocalPresetChange(modelId: string) {
    const preset = findLocalEmbeddingPreset(modelId) ?? DEFAULT_LOCAL_EMBEDDING_PRESET;
    form.setValue('model', preset.modelId, { shouldValidate: true });
    form.setValue('dimension', preset.dimension, { shouldValidate: true });
  }

  return (
    <Form {...form}>
      <form id={EMBEDDING_FORM_ID} onSubmit={form.handleSubmit(onValid)} className="space-y-4">
        <FormItem>
          <FormLabel>服务商</FormLabel>
          <Select value={watchedProviderId} onValueChange={handleProviderChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="请选择服务商" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.providerId && (
            <p className="text-sm text-destructive">{form.formState.errors.providerId.message}</p>
          )}
        </FormItem>

        {isLocalOnnx ? (
          <>
            <FormItem>
              <FormLabel>模型</FormLabel>
              <Select value={watchedModel} onValueChange={handleLocalPresetChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {LOCAL_EMBEDDING_PRESETS.map((preset) => (
                    <SelectItem key={preset.modelId} value={preset.modelId}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.model && (
                <p className="text-sm text-destructive">{form.formState.errors.model.message}</p>
              )}
            </FormItem>

            <FormField
              control={form.control}
              name="dimension"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>维度</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" disabled />
                  </FormControl>
                  {activePreset && (
                    <p className="text-xs text-muted-foreground">
                      首次使用会自动下载模型（约 {activePreset.approxSizeMB} MB），切换维度会重建全部嵌入索引。
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
          <>
            <FormItem>
              <FormLabel>模型</FormLabel>
              <ModelCombobox
                value={watchedModel}
                providerId={watchedProviderId}
                groups={nonLocalModelGroups}
                onProviderChange={(pid) => form.setValue('providerId', pid, { shouldValidate: true })}
                onChange={(m) => form.setValue('model', m, { shouldValidate: true })}
                api={api}
              />
              {form.formState.errors.model && (
                <p className="text-sm text-destructive">{form.formState.errors.model.message}</p>
              )}
            </FormItem>

            <FormField
              control={form.control}
              name="dimension"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>维度</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
      </form>
    </Form>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-200">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function GeneralTab({
  backendUrl,
  dbPath,
  bindings,
  providers,
  api,
  onPersistBindings,
}: {
  backendUrl: string;
  dbPath: string | null;
  bindings: Bindings | null;
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  onPersistBindings: (next: Bindings) => Promise<void>;
}) {
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [usageStats, setUsageStats] = useState(false);
  const [editEmbedding, setEditEmbedding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayPath =
    dbPath == null
      ? '加载中…'
      : dbPath.length > 60
        ? '…' + dbPath.slice(-57)
        : dbPath;

  function getProviderLabel(providerId: string) {
    return providers.find((p) => p.id === providerId)?.label ?? providerId;
  }

  async function handleEmbeddingValid(values: EmbeddingFormValues) {
    setSaveError(null);
    setSaving(true);
    try {
      await onPersistBindings({
        embedding: {
          providerId: values.providerId,
          model: values.model,
          dimension: values.dimension,
        },
      });
      setEditEmbedding(false);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const embeddingDefaults: EmbeddingFormValues = bindings
    ? {
        providerId: bindings.embedding.providerId,
        model: bindings.embedding.model,
        dimension: bindings.embedding.dimension,
      }
    : { providerId: providers[0]?.id ?? '', model: '', dimension: 1536 };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card text-card-foreground divide-y divide-border">
        <SettingRow title="后端服务" description="本地 Mastra 服务器地址">
          <span className="text-sm text-muted-foreground font-mono">{backendUrl}</span>
        </SettingRow>

        <SettingRow title="数据目录" description="本地数据库与索引存放位置">
          <span
            className="text-xs text-muted-foreground font-mono truncate max-w-xs block"
            title={dbPath ?? ''}
          >
            {displayPath}
          </span>
        </SettingRow>

        <Separator />

        <SettingRow title="启动时自动检查更新" description="应用启动时检查新版本">
          <Label className="sr-only" htmlFor="auto-update">
            启动时自动检查更新
          </Label>
          <Switch
            id="auto-update"
            checked={autoUpdate}
            onCheckedChange={setAutoUpdate}
          />
        </SettingRow>

        <SettingRow title="启用使用统计" description="匿名使用数据，帮助改进产品">
          <Label className="sr-only" htmlFor="usage-stats">
            启用使用统计
          </Label>
          <Switch
            id="usage-stats"
            checked={usageStats}
            onCheckedChange={setUsageStats}
          />
        </SettingRow>
      </div>

      <div className="rounded-lg border border-neutral-800">
        <div className="px-4 py-3 flex items-center justify-between gap-4 border-b border-neutral-800">
          <div>
            <div className="text-sm font-medium text-neutral-200">向量嵌入</div>
            <div className="text-xs text-muted-foreground mt-0.5">用于文档检索的嵌入模型</div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5">
          {bindings ? (
            <>
              <div className="flex-1 min-w-0 text-sm text-neutral-300 truncate">
                {getProviderLabel(bindings.embedding.providerId)} · {bindings.embedding.model}
                <span className="text-xs text-neutral-500 ml-2">
                  {bindings.embedding.dimension}维
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditEmbedding(true)}
                aria-label="编辑"
              >
                <RiPencilLine className="size-3.5" />
              </Button>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">加载中…</div>
          )}
        </div>
      </div>

      <Dialog open={editEmbedding} onOpenChange={(o) => { if (!o) setEditEmbedding(false); }}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>编辑向量嵌入</DialogTitle>
          </DialogHeader>
          <EmbeddingEditForm
            key={editEmbedding ? 'open' : 'closed'}
            defaultValues={embeddingDefaults}
            providers={providers}
            api={api}
            onValid={handleEmbeddingValid}
          />
          {saveError && (
            <div className="text-xs text-destructive">{saveError}</div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button type="submit" form={EMBEDDING_FORM_ID} disabled={saving}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
