import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AGENT_TYPE_LABELS, AGENT_TYPE_ORDER, type AgentType, type ProviderConfig } from './types';
import { makeConfigApi } from './api';
import { ModelCombobox } from './tabs/_shared';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export type AgentFormValues = {
  id: string;
  type: AgentType;
  label: string;
  description?: string;
  providerId: string;
  model: string;
  systemPrompt: string;
};

function makeAgentSchema(
  mode: 'create' | 'edit',
  builtin: boolean,
  existingIds: string[],
  providerIds: string[],
  currentId?: string,
) {
  const takenIds =
    mode === 'edit' ? existingIds.filter((id) => id !== currentId) : existingIds;
  return z.object({
    id:
      mode === 'create' && !builtin
        ? z
            .string()
            .min(1, 'ID 不能为空')
            .regex(/^[a-z][a-z0-9-]*$/, 'ID 只能以小写字母开头，包含小写字母、数字、横线')
            .refine((v) => !takenIds.includes(v), 'ID 已被使用')
        : z.string(),
    type: z.enum(['supervisor', 'architect', 'chronicler', 'editor', 'loreKeeper'] as const),
    label: builtin ? z.string() : z.string().trim().min(1, '名称不能为空'),
    description: z.string().optional(),
    providerId: z
      .string()
      .min(1, '请选择服务商')
      .refine((v) => providerIds.length === 0 || providerIds.includes(v), '请选择服务商'),
    model: z.string().trim().min(1, '请输入或选择模型'),
    systemPrompt: z.string().trim().min(1, 'System Prompt 不能为空'),
  });
}

export function AgentForm({
  defaultValues,
  mode,
  builtin = false,
  lockedType,
  existingIds,
  defaultPromptByType,
  providers,
  api,
  formId,
  onValid,
}: {
  defaultValues?: Partial<AgentFormValues>;
  mode: 'create' | 'edit';
  builtin?: boolean;
  lockedType?: AgentType;
  existingIds: string[];
  defaultPromptByType: Partial<Record<AgentType, string>>;
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  formId: string;
  onValid: (values: AgentFormValues) => void;
}) {
  const currentId = mode === 'edit' ? defaultValues?.id : undefined;
  const providerIds = providers.map((p) => p.id);

  const schema = useMemo(
    () => makeAgentSchema(mode, builtin, existingIds, providerIds, currentId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, builtin, existingIds.join(','), providerIds.join(','), currentId],
  );

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: defaultValues?.id ?? '',
      type: lockedType ?? defaultValues?.type ?? 'supervisor',
      label: defaultValues?.label ?? '',
      description: defaultValues?.description ?? '',
      providerId: defaultValues?.providerId ?? providers[0]?.id ?? '',
      model: defaultValues?.model ?? '',
      systemPrompt: defaultValues?.systemPrompt ?? '',
    },
  });

  const watchedType = form.watch('type');
  const watchedProviderId = form.watch('providerId');
  const watchedModel = form.watch('model');

  useEffect(() => {
    if (lockedType) form.setValue('type', lockedType);
  }, [lockedType, form]);

  function fillDefault() {
    const def = defaultPromptByType[watchedType];
    if (!def) return;
    const current = form.getValues('systemPrompt');
    if (current.trim()) {
      if (!window.confirm('当前已有内容，确认覆盖？')) return;
    }
    form.setValue('systemPrompt', def, { shouldValidate: true });
  }

  const idDisabled = mode === 'edit' || builtin;
  const typeDisabled = mode === 'edit' || builtin || !!lockedType;
  const labelDisabled = builtin;

  const allModelGroups = providers.map((p) => ({
    providerId: p.id,
    providerLabel: p.label,
    models: p.models ?? [],
  }));

  const selectedProviderLabel = providers.find((p) => p.id === watchedProviderId)?.label;

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(onValid)}
        className="space-y-4"
        autoComplete="off"
      >
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
                    disabled={idDisabled}
                    autoComplete="off"
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
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>类型</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={typeDisabled}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {AGENT_TYPE_ORDER.map((t) => (
                      <SelectItem key={t} value={t}>
                        {AGENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>名称</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  disabled={labelDisabled}
                  autoComplete="off"
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
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>描述（可选）</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>服务商 / 模型</FormLabel>
          <ModelCombobox
            value={watchedModel}
            providerId={watchedProviderId}
            groups={allModelGroups}
            onProviderChange={(pid) => form.setValue('providerId', pid, { shouldValidate: true })}
            onChange={(m) => form.setValue('model', m, { shouldValidate: true })}
            api={api}
          />
          {selectedProviderLabel && (
            <p className="text-xs text-neutral-500">{selectedProviderLabel}</p>
          )}
          {form.formState.errors.providerId && (
            <p className="text-sm text-destructive">{form.formState.errors.providerId.message}</p>
          )}
          {form.formState.errors.model && (
            <p className="text-sm text-destructive">{form.formState.errors.model.message}</p>
          )}
        </FormItem>

        <FormField
          control={form.control}
          name="systemPrompt"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>System Prompt</FormLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-neutral-200"
                  onClick={fillDefault}
                  disabled={!defaultPromptByType[watchedType]}
                >
                  基于默认填充
                </Button>
              </div>
              <FormControl>
                <textarea
                  {...field}
                  className="w-full min-h-[280px] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono text-neutral-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                  placeholder={defaultPromptByType[watchedType] ?? '输入 System Prompt…'}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
