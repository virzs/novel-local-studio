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
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { PlusIcon, EditIcon, TrashIcon } from '../../components/business/shared/Icons';
import { listAgentConfigs, deleteAgentConfig } from '../../api';
import type { AgentConfig } from '../../types';
import { AgentFormDialog } from './AgentFormDialog';

type CategoryKey = '统筹调度' | '前期策划' | '写作执行' | '质量把控' | '自定义';

const CATEGORY_PRESET_IDS: Record<Exclude<CategoryKey, '自定义'>, string[]> = {
  '统筹调度': ['preset-director'],
  '前期策划': ['preset-worldbuilder', 'preset-character-designer', 'preset-outline-planner', 'preset-chapter-planner'],
  '写作执行': ['preset-writer', 'preset-dialogue'],
  '质量把控': ['preset-polisher', 'preset-reviewer', 'preset-reader-feedback'],
};

const CATEGORY_META: Record<CategoryKey, { icon: string; label: string }> = {
  '统筹调度': { icon: '🎬', label: '统筹调度' },
  '前期策划': { icon: '📐', label: '前期策划' },
  '写作执行': { icon: '✍️', label: '写作执行' },
  '质量把控': { icon: '🔍', label: '质量把控' },
  '自定义': { icon: '⚙️', label: '自定义' },
};

const CATEGORY_ORDER: CategoryKey[] = ['统筹调度', '前期策划', '写作执行', '质量把控', '自定义'];

function getCategoryForAgent(agent: AgentConfig): CategoryKey {
  for (const [category, ids] of Object.entries(CATEGORY_PRESET_IDS) as [Exclude<CategoryKey, '自定义'>, string[]][]) {
    if (ids.includes(agent.id)) return category;
  }
  return '自定义';
}

function groupAgentsByCategory(agents: AgentConfig[]): Map<CategoryKey, AgentConfig[]> {
  const map = new Map<CategoryKey, AgentConfig[]>();
  for (const key of CATEGORY_ORDER) {
    map.set(key, []);
  }
  for (const agent of agents) {
    const cat = getCategoryForAgent(agent);
    map.get(cat)!.push(agent);
  }
  return map;
}

function AgentCard({
  agent,
  onEdit,
  onDeleteRequest,
}: {
  agent: AgentConfig;
  onEdit: (agent: AgentConfig) => void;
  onDeleteRequest: (agent: AgentConfig) => void;
}) {
  const isPreset = agent.isPreset === 1;

  return (
    <Card className="group relative gap-2 py-4 bg-card border-border hover:border-border rounded-sm transition-colors shadow-none">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-foreground text-base leading-snug">
          <div className="flex items-start gap-2">
            {agent.name}
            {isPreset && (
              <Badge variant="default" className="flex-shrink-0 mt-0.5 text-[10px] tracking-wide uppercase">
                预设
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardAction className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onEdit(agent)}
            title="编辑"
          >
            <EditIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDeleteRequest(agent)}
            disabled={isPreset}
            className={isPreset ? 'opacity-40 cursor-not-allowed' : 'hover:text-destructive hover:bg-destructive/10'}
            title={isPreset ? '预设不可删除' : '删除'}
          >
            <TrashIcon />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="px-4 py-0 flex-1">
        <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
          {agent.description ?? <span className="italic text-muted-foreground">暂无描述</span>}
        </p>
      </CardContent>

      <CardFooter className="px-4 pt-1 pb-0">
        <p className="text-xs text-muted-foreground font-mono">
          {agent.provider} · {agent.model || '未指定模型'}
        </p>
      </CardFooter>
    </Card>
  );
}

function CategorySection({
  categoryKey,
  agents,
  onEdit,
  onDeleteRequest,
}: {
  categoryKey: CategoryKey;
  agents: AgentConfig[];
  onEdit: (agent: AgentConfig) => void;
  onDeleteRequest: (agent: AgentConfig) => void;
}) {
  const { icon, label } = CATEGORY_META[categoryKey];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm" aria-hidden="true">{icon}</span>
        <span className="text-xs text-muted-foreground tracking-widest uppercase">
          {label}
        </span>
        <div className="flex-1 h-px bg-muted" />
        <span className="text-xs text-muted-foreground font-mono">
          {agents.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onEdit={onEdit}
            onDeleteRequest={onDeleteRequest}
          />
        ))}
      </div>
    </div>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<AgentConfig | null>(null);

  async function loadAgents() {
    try {
      const data = await listAgentConfigs();
      setAgents(data.agents ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAgents(); }, []);

  async function handleDelete(agent: AgentConfig) {
    if (agent.isPreset === 1) return;
    setDeleteError(null);
    try {
      await deleteAgentConfig(agent.id);
      await loadAgents();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : '删除失败');
    }
  }

  function openCreate() {
    setEditingAgent(null);
    setDialogOpen(true);
  }

  function openEdit(agent: AgentConfig) {
    setEditingAgent(agent);
    setDialogOpen(true);
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">加载中…</p>;
  }

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  const grouped = groupAgentsByCategory(agents);

  const visibleCategories = CATEGORY_ORDER.filter((key) => {
    if (key === '自定义') return (grouped.get(key)?.length ?? 0) > 0;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground text-sm">
          共 {agents.length} 个智能体
        </p>
        <Button type="button" onClick={openCreate} className="inline-flex items-center gap-2">
          <PlusIcon />
          新建智能体
        </Button>
      </div>

      {deleteError && (
        <p className="mb-4 text-destructive text-sm">{deleteError}</p>
      )}

      {agents.length === 0 ? (
        <div className="border border-dashed border-border rounded-sm p-12 text-center">
          <p className="italic text-muted-foreground text-lg">
            暂无智能体
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            点击「新建智能体」创建第一个
          </p>
        </div>
      ) : (
        <div>
          {visibleCategories.map((key) => {
            const categoryAgents = grouped.get(key) ?? [];
            return (
              <CategorySection
                key={key}
                categoryKey={key}
                agents={categoryAgents}
                onEdit={openEdit}
                onDeleteRequest={(agent) => setConfirmDeleteAgent(agent)}
              />
            );
          })}
        </div>
      )}

      <AgentFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agent={editingAgent}
        onSaved={() => void loadAgents()}
      />

      <AlertDialog
        open={confirmDeleteAgent !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteAgent(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除智能体</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除智能体「{confirmDeleteAgent?.name}」吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirmDeleteAgent) {
                  void handleDelete(confirmDeleteAgent);
                  setConfirmDeleteAgent(null);
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
