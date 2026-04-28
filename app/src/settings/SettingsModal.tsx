import { useEffect, useMemo, useState } from 'react';
import {
  RiCheckLine,
  RiSettings3Line,
  RiInformationLine,
  RiServerLine,
  RiSparkling2Line,
  RiGroupLine,
} from '@remixicon/react';
import { X } from 'lucide-react';
import { makeConfigApi } from './api';
import type { AgentDef, AgentType, Bindings, Lineup, ProviderConfig } from './types';
import type { TestState } from './tabs/_shared';
import { GeneralTab } from './tabs/GeneralTab';
import { ProvidersTab } from './tabs/ProvidersTab';
import { AgentsTab } from './tabs/AgentsTab';
import { AboutTab } from './tabs/AboutTab';
import { LineupsTab } from './tabs/LineupsTab';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tab = 'general' | 'about' | 'providers' | 'agents' | 'lineups';

const NAV = [
  {
    group: '应用',
    items: [
      { id: 'general' as Tab, label: '通用', Icon: RiSettings3Line },
      { id: 'about' as Tab, label: '关于', Icon: RiInformationLine },
    ],
  },
  {
    group: '服务器',
    items: [
      { id: 'providers' as Tab, label: '服务商', Icon: RiServerLine },
      { id: 'agents' as Tab, label: '智能体', Icon: RiSparkling2Line },
      { id: 'lineups' as Tab, label: '阵容', Icon: RiGroupLine },
    ],
  },
];

const TAB_LABELS: Record<Tab, string> = {
  general: '通用',
  about: '关于',
  providers: '服务商',
  agents: '智能体',
  lineups: '阵容',
};

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded text-sm transition-colors',
        active
          ? 'bg-neutral-800/60 text-neutral-100'
          : 'text-neutral-400 hover:bg-neutral-800/40',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-indigo-500 rounded-r" />
      )}
      <Icon className="size-4 shrink-0" />
      {label}
    </button>
  );
}

export function SettingsModal({
  backendUrl,
  onClose,
}: {
  backendUrl: string;
  onClose: () => void;
}) {
  const api = useMemo(() => makeConfigApi(backendUrl), [backendUrl]);

  const [tab, setTab] = useState<Tab>('general');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [bindings, setBindings] = useState<Bindings | null>(null);
  const [agentDefs, setAgentDefs] = useState<AgentDef[]>([]);
  const [lineups, setLineups] = useState<Lineup[]>([]);
  const [agentTypeMeta, setAgentTypeMeta] = useState<
    Array<{ id: string; tools: string[]; description: string }> | null
  >(null);
  const [dbPath, setDbPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingProv, setSavingProv] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  useEffect(() => {
    (async () => {
      try {
        const [p, b, a, l] = await Promise.all([
          api.getProviders(),
          api.getBindings(),
          api.getAgentDefs(),
          api.getLineups(),
        ]);
        setProviders(p);
        setBindings(b);
        setAgentDefs(a);
        setLineups(l);
      } catch (e) {
        setLoadError(String(e));
      }
    })();
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${backendUrl}/api/health`);
        const j = (await r.json()) as { dbPath?: string };
        setDbPath(j?.dbPath ?? null);
      } catch {
      }
    })();
  }, [backendUrl]);

  const defaultPromptByType = useMemo(() => {
    const map: Partial<Record<AgentType, string>> = {};
    for (const a of agentDefs) {
      if (a.builtin) map[a.type] = a.systemPrompt;
    }
    return map;
  }, [agentDefs]);

  function flashSaved(msg: string) {
    setSavedHint(msg);
    setTimeout(() => setSavedHint(null), 2000);
  }

  async function persistProviders(next: ProviderConfig[]) {
    setSavingProv(true);
    try {
      await api.saveProviders(next);
      setProviders(next);
      flashSaved('服务商已保存');
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setSavingProv(false);
    }
  }

  async function persistBindings(next: Bindings) {
    try {
      await api.saveBindings(next);
      setBindings(next);
      flashSaved('向量嵌入已保存');
    } catch (e) {
      setLoadError(String(e));
      throw e;
    }
  }

  async function persistAgents(next: AgentDef[]) {
    try {
      await api.saveAgentDefs(next);
      setAgentDefs(next);
      flashSaved('智能体已保存');
    } catch (e) {
      setLoadError(String(e));
      throw e;
    }
  }

  async function persistLineups(next: Lineup[]) {
    try {
      await api.saveLineups(next);
      setLineups(next);
      flashSaved('阵容已保存');
    } catch (e) {
      setLoadError(String(e));
      throw e;
    }
  }

  async function ensureAgentTypeMeta() {
    if (agentTypeMeta !== null) return;
    try {
      const r = await api.getAgentTypeMeta();
      setAgentTypeMeta(
        r.agents.map((a) => ({ id: a.id, tools: a.tools, description: a.description })),
      );
    } catch {
    }
  }

  async function runTest(
    providerId: string,
    model: string,
    inline?: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> },
  ) {
    const key = `${providerId}::${model}`;
    setTests((t) => ({ ...t, [key]: { state: 'running' } }));
    const r = await api.testProvider(providerId, model, inline);
    setTests((t) => ({
      ...t,
      [key]: r.ok
        ? { state: 'ok', msg: r.text ?? 'ok' }
        : { state: 'fail', msg: r.error ?? 'failed' },
    }));
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-none w-[960px] max-w-[95vw] h-[85vh] p-0 gap-0 flex overflow-hidden"
      >
        <DialogTitle className="sr-only">设置</DialogTitle>

        <aside className="w-52 shrink-0 bg-neutral-900 flex flex-col border-r border-neutral-800">
          <nav className="flex-1 py-4 px-2 space-y-5 overflow-y-auto">
            {NAV.map((group) => (
              <div key={group.group}>
                <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-neutral-500">
                  {group.group}
                </div>
                <div className="space-y-0.5">
                  {group.items.map(({ id, label, Icon }) => (
                    <NavItem
                      key={id}
                      icon={Icon}
                      label={label}
                      active={tab === id}
                      onClick={() => {
                        setTab(id);
                        if (id === 'agents' || id === 'lineups') void ensureAgentTypeMeta();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="px-4 py-3 border-t border-neutral-800">
            <div className="text-[10px] text-neutral-600">Novel Local Studio</div>
            <div className="text-[10px] text-neutral-700">v0.0.0</div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between px-6 py-3.5 border-b border-neutral-800 shrink-0">
            <h2 className="text-xl font-medium text-neutral-100">{TAB_LABELS[tab]}</h2>
            <div className="flex items-center gap-3">
              {savedHint && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <RiCheckLine className="size-3.5" /> {savedHint}
                </span>
              )}
              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="关闭">
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loadError && (
              <div className="mb-4 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                {loadError}
              </div>
            )}

            {tab === 'general' && (
              <GeneralTab
                backendUrl={backendUrl}
                dbPath={dbPath}
                bindings={bindings}
                providers={providers}
                api={api}
                onPersistBindings={persistBindings}
              />
            )}

            {tab === 'providers' && (
              <ProvidersTab
                providers={providers}
                tests={tests}
                saving={savingProv}
                onPersist={persistProviders}
                onTest={runTest}
                api={api}
              />
            )}

            {tab === 'agents' && (
              <AgentsTab
                providers={providers}
                api={api}
                agentDefs={agentDefs}
                defaultPromptByType={defaultPromptByType}
                agentTypeMeta={agentTypeMeta}
                onPersistAgents={persistAgents}
              />
            )}

            {tab === 'lineups' && (
              <LineupsTab
                lineups={lineups}
                agentDefs={agentDefs}
                defaultPromptByType={defaultPromptByType}
                providers={providers}
                api={api}
                onPersist={persistLineups}
                onAgentsChanged={persistAgents}
              />
            )}

            {tab === 'about' && <AboutTab backendUrl={backendUrl} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
