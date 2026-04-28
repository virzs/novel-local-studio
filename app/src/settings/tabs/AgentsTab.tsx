import { useMemo, useState } from 'react';
import {
  RiPencilLine,
  RiAddLine,
  RiDeleteBin6Line,
  RiArrowDownSLine,
} from '@remixicon/react';
import {
  AGENT_TYPE_LABELS,
  AGENT_TYPE_ORDER,
  type AgentDef,
  type AgentType,
  type ProviderConfig,
} from '../types';
import { makeConfigApi } from '../api';
import { AgentForm } from '../agent-form';
import type { AgentFormValues } from '../agent-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type AgentTypeMeta = { id: string; tools: string[]; description: string };

const AGENT_FORM_ID = 'agent-edit-form';

function AgentTypeSection({
  type,
  agents,
  defaultOpen,
  agentTypeMeta,
  providers,
  onEdit,
  onDelete,
  onCreate,
}: {
  type: AgentType;
  agents: AgentDef[];
  defaultOpen: boolean;
  agentTypeMeta: AgentTypeMeta[] | null;
  providers: ProviderConfig[];
  onEdit: (agent: AgentDef) => void;
  onDelete: (agent: AgentDef) => void;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [viewAgent, setViewAgent] = useState<AgentDef | null>(null);

  const meta = agentTypeMeta?.find((m) => m.id === type);

  function getProviderLabel(providerId: string) {
    return providers.find((p) => p.id === providerId)?.label ?? providerId;
  }

  return (
    <div className="rounded-lg border border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-900/40 transition-colors"
      >
        <span className="flex-1 text-sm font-medium text-neutral-200">
          {AGENT_TYPE_LABELS[type]}
        </span>
        <Badge variant="secondary" className="text-xs">
          {agents.length}
        </Badge>
        <RiArrowDownSLine
          className={cn('size-4 text-neutral-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-neutral-800">
          {agents.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">暂无智能体</div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewAgent(agent)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setViewAgent(agent);
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-neutral-900/60 transition-colors focus:outline-none focus-visible:bg-neutral-900/60"
                >
                  {agent.builtin && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      内置
                    </Badge>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-neutral-200 truncate">{agent.label}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {agent.id}
                      {agent.description ? ` · ${agent.description}` : ''}
                    </div>
                  </div>
                  {agent.model && (
                    <div className="text-xs text-neutral-500 shrink-0 hidden sm:block">
                      {getProviderLabel(agent.providerId)} · {agent.model}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(agent);
                    }}
                    aria-label="编辑"
                  >
                    <RiPencilLine className="size-3.5" />
                  </Button>
                  {!agent.builtin && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(agent);
                      }}
                      aria-label="删除"
                      className="text-neutral-400 hover:text-red-400 hover:bg-red-950/40"
                    >
                      <RiDeleteBin6Line className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-t border-neutral-800/60">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-neutral-200"
              onClick={onCreate}
            >
              <RiAddLine className="size-3.5" /> 新增此类型智能体
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!viewAgent} onOpenChange={(o) => { if (!o) setViewAgent(null); }}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{viewAgent?.label} · 详情</DialogTitle>
          </DialogHeader>
          {viewAgent && (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  类型
                </div>
                <p className="text-sm text-neutral-300">{AGENT_TYPE_LABELS[viewAgent.type]}</p>
              </div>
              {viewAgent.description && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    描述
                  </div>
                  <p className="text-sm text-neutral-300">{viewAgent.description}</p>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  模型
                </div>
                <p className="text-sm text-neutral-300">
                  {getProviderLabel(viewAgent.providerId)} · {viewAgent.model || '未设置'}
                </p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  System Prompt
                </div>
                <ScrollArea className="h-48 w-full rounded-lg">
                  <pre className="font-mono text-xs text-neutral-300 bg-neutral-900 rounded-lg px-3 py-2.5 whitespace-pre-wrap break-words min-h-full">
                    {viewAgent.systemPrompt || (
                      <span className="text-muted-foreground">（空）</span>
                    )}
                  </pre>
                </ScrollArea>
              </div>
              {meta && meta.tools.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    可用工具
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.tools.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">关闭</Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (viewAgent) {
                  setViewAgent(null);
                  onEdit(viewAgent);
                }
              }}
            >
              <RiPencilLine className="size-3.5" /> 编辑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AgentsTab({
  providers,
  api,
  agentDefs,
  defaultPromptByType,
  agentTypeMeta,
  onPersistAgents,
}: {
  providers: ProviderConfig[];
  api: ReturnType<typeof makeConfigApi>;
  agentDefs: AgentDef[];
  defaultPromptByType: Partial<Record<AgentType, string>>;
  agentTypeMeta: AgentTypeMeta[] | null;
  onPersistAgents: (next: AgentDef[]) => Promise<void>;
}) {
  const [agentEditTarget, setAgentEditTarget] = useState<{
    agent?: AgentDef;
    lockedType?: AgentType;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentDef | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [persisting, setPersisting] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const existingIds = agentDefs.map((a) => a.id);

  async function handleAgentValid(values: AgentFormValues) {
    setPersistError(null);
    setPersisting(true);
    try {
      let next: AgentDef[];
      if (agentEditTarget?.agent) {
        next = agentDefs.map((a) =>
          a.id === agentEditTarget.agent!.id
            ? {
                ...a,
                description: values.description,
                providerId: values.providerId,
                model: values.model,
                systemPrompt: values.systemPrompt,
                updatedAt: Date.now(),
              }
            : a,
        );
      } else {
        const now = Date.now();
        next = [
          ...agentDefs,
          {
            id: values.id,
            type: values.type,
            label: values.label,
            description: values.description,
            providerId: values.providerId,
            model: values.model,
            systemPrompt: values.systemPrompt,
            builtin: false,
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
      await onPersistAgents(next);
      setAgentEditTarget(null);
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
      const next = agentDefs.filter((a) => a.id !== deleteTarget.id);
      await onPersistAgents(next);
      setDeleteTarget(null);
      setDeleteInput('');
    } catch (e) {
      setPersistError(String(e));
    } finally {
      setPersisting(false);
    }
  }

  const deleteConfirmable = deleteTarget !== null && deleteInput.trim() === deleteTarget.id;

  const agentsByType = useMemo(() => {
    const map: Record<AgentType, AgentDef[]> = {
      supervisor: [],
      architect: [],
      chronicler: [],
      editor: [],
      loreKeeper: [],
    };
    for (const a of agentDefs) {
      map[a.type].push(a);
    }
    return map;
  }, [agentDefs]);

  const editingAgent = agentEditTarget?.agent;
  const agentFormDefaultValues: Partial<AgentFormValues> | undefined = editingAgent
    ? {
        id: editingAgent.id,
        type: editingAgent.type,
        label: editingAgent.label,
        description: editingAgent.description,
        providerId: editingAgent.providerId,
        model: editingAgent.model,
        systemPrompt: editingAgent.systemPrompt,
      }
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">智能体管理</h2>
          <div className="text-xs text-muted-foreground mt-0.5">
            管理内置与自定义智能体的模型与 System Prompt
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setAgentEditTarget({})}
        >
          <RiAddLine className="size-3.5" /> 新增智能体
        </Button>
      </div>

      {persistError && (
        <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {persistError}
        </div>
      )}

      <div className="space-y-2">
        {AGENT_TYPE_ORDER.map((type, idx) => (
          <AgentTypeSection
            key={type}
            type={type}
            agents={agentsByType[type]}
            defaultOpen={idx === 0}
            agentTypeMeta={agentTypeMeta}
            providers={providers}
            onEdit={(agent) => setAgentEditTarget({ agent })}
            onDelete={(agent) => {
              setDeleteTarget(agent);
              setDeleteInput('');
            }}
            onCreate={() => setAgentEditTarget({ lockedType: type })}
          />
        ))}
      </div>

      <Dialog open={!!agentEditTarget} onOpenChange={(o) => { if (!o) setAgentEditTarget(null); }}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {agentEditTarget?.agent
                ? `编辑智能体 · ${agentEditTarget.agent.label}`
                : '新增智能体'}
            </DialogTitle>
          </DialogHeader>
          {agentEditTarget && (
            <AgentForm
              key={agentEditTarget.agent?.id ?? 'new'}
              defaultValues={agentFormDefaultValues}
              mode={agentEditTarget.agent ? 'edit' : 'create'}
              builtin={agentEditTarget.agent?.builtin ?? false}
              lockedType={agentEditTarget.lockedType}
              existingIds={existingIds}
              defaultPromptByType={defaultPromptByType}
              providers={providers}
              api={api}
              formId={AGENT_FORM_ID}
              onValid={handleAgentValid}
            />
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">取消</Button>
            </DialogClose>
            <Button type="submit" form={AGENT_FORM_ID} disabled={persisting}>
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
            <DialogTitle>删除智能体</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-300">
                即将删除智能体{' '}
                <span className="font-medium text-red-400">{deleteTarget.label}</span>（
                <code className="text-xs">{deleteTarget.id}</code>）。此操作不可撤销。
              </p>
              <p className="text-xs text-muted-foreground">
                请输入智能体 ID{' '}
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
