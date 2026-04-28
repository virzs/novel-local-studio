import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RiAddLine,
  RiPencilLine,
  RiDeleteBin6Line,
  RiArrowDownSLine,
} from '@remixicon/react';
import {
  AGENT_TYPE_LABELS,
  AGENT_TYPE_ORDER,
  BUILTIN_AGENT_IDS,
  DEFAULT_LINEUP_ID,
  type AgentDef,
  type AgentType,
  type Lineup,
  type ProviderConfig,
} from '../types';
import { makeConfigApi } from '../api';
import { AgentForm } from '../agent-form';
import type { AgentFormValues } from '../agent-form';
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
import { cn } from '@/lib/utils';

const LINEUP_FORM_ID = 'lineup-edit-form';
const QUICK_AGENT_FORM_ID = 'quick-agent-form';

function makeLineupSchema(existingIds: string[], currentId?: string) {
  const takenIds = currentId ? existingIds.filter((id) => id !== currentId) : existingIds;
  return z.object({
    id: z
      .string()
      .min(1, 'ID 不能为空')
      .regex(/^[a-z][a-z0-9-]*$/, 'ID 只能以小写字母开头，包含小写字母、数字、横线')
      .refine((v) => v !== DEFAULT_LINEUP_ID, `ID 不能为 "${DEFAULT_LINEUP_ID}"`)
      .refine((v) => !takenIds.includes(v), 'ID 已被使用'),
    label: z.string().trim().min(1, '名称不能为空'),
    description: z.string().optional(),
    supervisor: z.string().min(1, '请选择智能体'),
    architect: z.string().min(1, '请选择智能体'),
    chronicler: z.string().min(1, '请选择智能体'),
    editor: z.string().min(1, '请选择智能体'),
    loreKeeper: z.string().min(1, '请选择智能体'),
  });
}

type LineupFormValues = {
  id: string;
  label: string;
  description?: string;
  supervisor: string;
  architect: string;
  chronicler: string;
  editor: string;
  loreKeeper: string;
};

function defaultVirtualLineup(): Lineup {
  const now = 0;
  return {
    id: DEFAULT_LINEUP_ID,
    label: '默认阵容',
    description: '使用 5 个内置智能体，未指定阵容时使用',
    agents: {
      supervisor: BUILTIN_AGENT_IDS.supervisor,
      architect: BUILTIN_AGENT_IDS.architect,
      chronicler: BUILTIN_AGENT_IDS.chronicler,
      editor: BUILTIN_AGENT_IDS.editor,
      loreKeeper: BUILTIN_AGENT_IDS.loreKeeper,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function LineupSlots({
  lineup,
  agentDefs,
}: {
  lineup: Lineup;
  agentDefs: AgentDef[];
}) {
  return (
    <div className="divide-y divide-neutral-800/60">
      {AGENT_TYPE_ORDER.map((type) => {
        const agentId = lineup.agents[type];
        const agent = agentDefs.find((a) => a.id === agentId);
        return (
          <div key={type} className="flex items-center gap-3 px-4 py-2">
            <span className="w-44 shrink-0 text-xs text-muted-foreground">
              {AGENT_TYPE_LABELS[type]}
            </span>
            <span className="text-xs text-neutral-300 truncate">
              {agent ? agent.label : agentId}
            </span>
            {agent?.builtin && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                内置
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LineupCard({
  lineup,
  agentDefs,
  isDefault,
  onEdit,
  onDelete,
}: {
  lineup: Lineup;
  agentDefs: AgentDef[];
  isDefault: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-800">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-200 truncate">{lineup.label}</span>
            {isDefault && (
              <Badge variant="secondary" className="text-[10px]">
                默认
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {lineup.id}
            {lineup.description ? ` · ${lineup.description}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-muted-foreground hover:text-neutral-300 flex items-center gap-1 transition-colors"
        >
          {open ? '收起' : '展开'}
          <RiArrowDownSLine
            className={cn('size-3.5 transition-transform', open && 'rotate-180')}
          />
        </button>
        {!isDefault && onEdit && (
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="编辑">
            <RiPencilLine className="size-3.5" />
          </Button>
        )}
        {!isDefault && onDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="删除"
            className="text-neutral-400 hover:text-red-400 hover:bg-red-950/40"
          >
            <RiDeleteBin6Line className="size-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-neutral-800">
          <LineupSlots lineup={lineup} agentDefs={agentDefs} />
        </div>
      )}
    </div>
  );
}

function QuickCreateAgentDialog({
  open,
  lockedType,
  agentDefs,
  defaultPromptByType,
  providers,
  api,
  onClose,
  onCreated,
}: {
  open: boolean;
  lockedType: AgentType;
  agentDefs: AgentDef[];
  defaultPromptByType: Partial<Record<AgentType, string>>;
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  onClose: () => void;
  onCreated: (agent: AgentDef) => void;
}) {
  const existingIds = agentDefs.map((a) => a.id);

  function handleValid(values: AgentFormValues) {
    const now = Date.now();
    const newAgent: AgentDef = {
      id: values.id,
      type: values.type,
      label: values.label,
      description: values.description,
      systemPrompt: values.systemPrompt,
      providerId: values.providerId,
      model: values.model,
      builtin: false,
      createdAt: now,
      updatedAt: now,
    };
    onCreated(newAgent);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>快速创建智能体 · {AGENT_TYPE_LABELS[lockedType]}</DialogTitle>
        </DialogHeader>
        <AgentForm
          key={`quick-${lockedType}`}
          mode="create"
          lockedType={lockedType}
          existingIds={existingIds}
          defaultPromptByType={defaultPromptByType}
          providers={providers}
          api={api}
          formId={QUICK_AGENT_FORM_ID}
          onValid={handleValid}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form={QUICK_AGENT_FORM_ID}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineupEditDialog({
  open,
  mode,
  lineup,
  lineups,
  agentDefs,
  defaultPromptByType,
  providers,
  api,
  onClose,
  onSave,
  onAgentsChanged,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  lineup?: Lineup;
  lineups: Lineup[];
  agentDefs: AgentDef[];
  defaultPromptByType: Partial<Record<AgentType, string>>;
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  onClose: () => void;
  onSave: (values: LineupFormValues) => Promise<void>;
  onAgentsChanged: (next: AgentDef[]) => Promise<void>;
}) {
  const existingIds = lineups.map((l) => l.id);
  const currentId = mode === 'edit' ? lineup?.id : undefined;

  const schema = useMemo(
    () => makeLineupSchema(existingIds, currentId),
    [existingIds, currentId],
  );

  const form = useForm<LineupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: lineup
      ? {
          id: lineup.id,
          label: lineup.label,
          description: lineup.description ?? '',
          supervisor: lineup.agents.supervisor,
          architect: lineup.agents.architect,
          chronicler: lineup.agents.chronicler,
          editor: lineup.agents.editor,
          loreKeeper: lineup.agents.loreKeeper,
        }
      : {
          id: '',
          label: '',
          description: '',
          supervisor: BUILTIN_AGENT_IDS.supervisor,
          architect: BUILTIN_AGENT_IDS.architect,
          chronicler: BUILTIN_AGENT_IDS.chronicler,
          editor: BUILTIN_AGENT_IDS.editor,
          loreKeeper: BUILTIN_AGENT_IDS.loreKeeper,
        },
  });

  const [quickCreateType, setQuickCreateType] = useState<AgentType | null>(null);
  const [localAgentDefs, setLocalAgentDefs] = useState<AgentDef[]>(agentDefs);

  useMemo(() => {
    setLocalAgentDefs(agentDefs);
  }, [agentDefs]);

  async function handleQuickCreated(newAgent: AgentDef) {
    const next = [...localAgentDefs, newAgent];
    setLocalAgentDefs(next);
    await onAgentsChanged(next);
    form.setValue(newAgent.type as keyof LineupFormValues, newAgent.id, { shouldValidate: true });
    setQuickCreateType(null);
  }

  const agentsByType = useMemo(() => {
    const map: Record<AgentType, AgentDef[]> = {
      supervisor: [],
      architect: [],
      chronicler: [],
      editor: [],
      loreKeeper: [],
    };
    for (const a of localAgentDefs) {
      map[a.type].push(a);
    }
    return map;
  }, [localAgentDefs]);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? '新增阵容' : `编辑阵容 · ${lineup?.label}`}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form
              id={LINEUP_FORM_ID}
              onSubmit={form.handleSubmit(onSave)}
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
                          disabled={mode === 'edit'}
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
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名称</FormLabel>
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
              </div>

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

              <div className="space-y-2 pt-1 border-t border-neutral-800/60">
                <div className="text-xs text-muted-foreground pb-1">智能体槽位</div>
                {AGENT_TYPE_ORDER.map((type) => {
                  const agents = agentsByType[type];
                  return (
                    <FormField
                      key={type}
                      control={form.control}
                      name={type as keyof LineupFormValues}
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center gap-3">
                            <FormLabel className="w-44 shrink-0 text-sm text-neutral-300 font-normal">
                              {AGENT_TYPE_LABELS[type]}
                            </FormLabel>
                            <div className="flex-1 min-w-0">
                              <Select
                                onValueChange={field.onChange}
                                value={field.value as string}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="选择智能体" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {agents.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                      <span className="flex items-center gap-2">
                                        {a.label}
                                        <span className="text-xs text-muted-foreground">
                                          {a.id}
                                        </span>
                                        {a.builtin && (
                                          <Badge variant="outline" className="text-[10px]">
                                            内置
                                          </Badge>
                                        )}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 text-xs"
                              onClick={() => setQuickCreateType(type)}
                            >
                              <RiAddLine className="size-3.5" /> 快速创建
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  );
                })}
              </div>
            </form>
          </Form>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button type="submit" form={LINEUP_FORM_ID}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {quickCreateType && (
        <QuickCreateAgentDialog
          open={!!quickCreateType}
          lockedType={quickCreateType}
          agentDefs={localAgentDefs}
          defaultPromptByType={defaultPromptByType}
          providers={providers}
          api={api}
          onClose={() => setQuickCreateType(null)}
          onCreated={(agent) => void handleQuickCreated(agent)}
        />
      )}
    </>
  );
}

export function LineupsTab({
  lineups,
  agentDefs,
  defaultPromptByType,
  providers,
  api,
  onPersist,
  onAgentsChanged,
}: {
  lineups: Lineup[];
  agentDefs: AgentDef[];
  defaultPromptByType: Partial<Record<AgentType, string>>;
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  onPersist: (next: Lineup[]) => Promise<void>;
  onAgentsChanged: (next: AgentDef[]) => Promise<void>;
}) {
  const [editTarget, setEditTarget] = useState<{ mode: 'create' } | { mode: 'edit'; lineup: Lineup } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lineup | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const virtualDefault = useMemo(() => defaultVirtualLineup(), []);
  const deleteConfirmable = deleteTarget !== null && deleteInput.trim() === deleteTarget.id;

  async function handleSave(values: LineupFormValues) {
    setPersistError(null);
    setPersisting(true);
    try {
      const agents: Record<AgentType, string> = {
        supervisor: values.supervisor,
        architect: values.architect,
        chronicler: values.chronicler,
        editor: values.editor,
        loreKeeper: values.loreKeeper,
      };
      let next: Lineup[];
      if (editTarget?.mode === 'edit') {
        next = lineups.map((l) =>
          l.id === editTarget.lineup.id
            ? { ...l, label: values.label, description: values.description, agents, updatedAt: Date.now() }
            : l,
        );
      } else {
        const now = Date.now();
        next = [
          ...lineups,
          {
            id: values.id,
            label: values.label,
            description: values.description,
            agents,
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
      await onPersist(next);
      setEditTarget(null);
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
      const next = lineups.filter((l) => l.id !== deleteTarget.id);
      await onPersist(next);
      setDeleteTarget(null);
      setDeleteInput('');
    } catch (e) {
      setPersistError(String(e));
    } finally {
      setPersisting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">阵容</h2>
          <div className="text-xs text-muted-foreground mt-0.5">
            为 5 个智能体类型槽位指定具体智能体实例
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setEditTarget({ mode: 'create' })}
        >
          <RiAddLine className="size-3.5" /> 新增阵容
        </Button>
      </div>

      {persistError && (
        <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {persistError}
        </div>
      )}

      <div className="space-y-2">
        <LineupCard
          lineup={virtualDefault}
          agentDefs={agentDefs}
          isDefault
        />
        {lineups.map((lineup) => (
          <LineupCard
            key={lineup.id}
            lineup={lineup}
            agentDefs={agentDefs}
            isDefault={false}
            onEdit={() => setEditTarget({ mode: 'edit', lineup })}
            onDelete={() => {
              setDeleteTarget(lineup);
              setDeleteInput('');
            }}
          />
        ))}
      </div>

      {editTarget && (
        <LineupEditDialog
          key={editTarget.mode === 'edit' ? editTarget.lineup.id : 'new'}
          open
          mode={editTarget.mode}
          lineup={editTarget.mode === 'edit' ? editTarget.lineup : undefined}
          lineups={lineups}
          agentDefs={agentDefs}
          defaultPromptByType={defaultPromptByType}
          providers={providers}
          api={api}
          onClose={() => setEditTarget(null)}
          onSave={handleSave}
          onAgentsChanged={onAgentsChanged}
        />
      )}

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
            <DialogTitle>删除阵容</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-300">
                即将删除阵容{' '}
                <span className="font-medium text-red-400">{deleteTarget.label}</span>（
                <code className="text-xs">{deleteTarget.id}</code>）。此操作不可撤销。
              </p>
              <p className="text-xs text-muted-foreground">
                请输入阵容 ID{' '}
                <code className="text-neutral-300">{deleteTarget.id}</code> 以确认删除：
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
                placeholder={deleteTarget.id}
              />
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
