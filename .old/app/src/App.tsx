import { useEffect, useState, useCallback } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AIChatProvider } from './contexts/AIChatContext';
import { API_BASE } from './lib/api';
import { listProjects, getShellInfo, getMastraInfo, getBootstrapState, getHealth } from './api';
import type { Health, BootstrapLog, BootstrapState, ShellInfo, Project, MastraInfo } from './types';

export type AppContext = {
  health: Health | null;
  shellInfo: ShellInfo | null;
  mastraInfo: MastraInfo | null;
  projects: Project[];
  refreshProjects: () => Promise<void>;
};

export function useAppContext() {
  return useOutletContext<AppContext>();
}

export function AppLayoutWrapper() {
  const ctx = useAppContext();
  return (
    <AppLayout
      health={ctx.health}
      shellInfo={ctx.shellInfo}
      mastraInfo={ctx.mastraInfo}
      projects={ctx.projects}
      refreshProjects={ctx.refreshProjects}
    />
  );
}

const BOOTSTRAP_RETRY_MS = 800;

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [shellInfo, setShellInfo] = useState<ShellInfo | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mastraInfo, setMastraInfo] = useState<MastraInfo | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    async function waitForHealthReady(): Promise<Health> {
      const nextHealth = await getHealth();
      if (!cancelled && nextHealth.error) {
        setHealth(nextHealth);
        throw new Error(nextHealth.error);
      }
      if (!cancelled && nextHealth.status !== 'ok') {
        setHealth(nextHealth);
        throw new Error('本地服务尚未 ready');
      }
      return nextHealth;
    }

    async function bootstrapApp() {
      try {
        const nextHealth = await waitForHealthReady();
        const [nextShell, nextProjects, nextMastra, nextBootstrap] = await Promise.all([
          getShellInfo(),
          listProjects(),
          getMastraInfo(),
          getBootstrapState(),
        ]);
        if (cancelled) return;
        setHealth(nextHealth);
        setShellInfo(nextShell);
        setProjects(nextProjects.projects ?? []);
        setMastraInfo(nextMastra);
        setBootstrap(nextBootstrap);
        setError(null);
        if (!nextBootstrap.ready) {
          retryTimer = window.setTimeout(() => { void bootstrapApp(); }, BOOTSTRAP_RETRY_MS);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '未知错误');
        retryTimer = window.setTimeout(() => { void bootstrapApp(); }, BOOTSTRAP_RETRY_MS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrapApp();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data.projects ?? []);
    } catch {
      void 0;
    }
  }, []);

    if (loading || !bootstrap || !bootstrap.ready) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-2xl border border-primary/25 bg-card rounded-sm p-8 shadow-2xl">
          <p className="text-primary text-xs tracking-[0.18em] uppercase mb-4">
            Local runtime bootstrap
          </p>
          <h1 className="text-3xl text-foreground mb-2 leading-tight">
            正在初始化后台服务
          </h1>
          <p className="text-muted-foreground text-sm mb-6">
            桌面端或网页端都通过同一个本地 API 启动流进入应用。
          </p>

          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground mb-5">
            <span>阶段：<span className="text-foreground">{bootstrap?.phase ?? 'starting'}</span></span>
            <span>API：<span className="font-mono text-xs">{API_BASE}</span></span>
            <span>状态：<span className="text-foreground">{error ? '等待重试' : '初始化中'}</span></span>
          </div>

          <div
            role="log"
            aria-live="polite"
            className="min-h-[200px] max-h-[320px] overflow-y-auto bg-background border border-border rounded-sm p-4 font-mono text-xs"
          >
            {(bootstrap?.logs ?? []).map((entry: BootstrapLog) => (
              <div key={`${entry.time}-${entry.message}`} className="flex gap-2.5 flex-wrap mb-2 leading-relaxed">
                <span className="text-muted-foreground">[{entry.time}]</span>
                <span className="text-primary">[{entry.level}]</span>
                <span className="text-foreground">{entry.message}</span>
              </div>
            ))}
            {(!bootstrap || bootstrap.logs.length === 0) && (
              <span className="text-muted-foreground">等待本地服务输出启动日志…</span>
            )}
          </div>

          {error && (
            <p className="mt-4 text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <AIChatProvider>
      <Outlet context={{ health, shellInfo, mastraInfo, projects, refreshProjects } satisfies AppContext} />
    </AIChatProvider>
  );
}
