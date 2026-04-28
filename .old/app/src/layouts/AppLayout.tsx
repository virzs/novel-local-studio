import { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { StatusRow } from '../components/business/shared/StatusRow';
import { useAIChat } from '../contexts/AIChatContext';
import { NoBookPage } from '../pages/NoBookPage';
import { BookSidebar } from '../components/business/navigation/BookSidebar';
import { archiveProject } from '../api';
import type { Health, MastraInfo, ShellInfo, Project } from '../types';

export type AppLayoutContext = {
  projects: Project[];
  mastraInfo: MastraInfo | null;
  shellInfo: ShellInfo | null;
  isMastraUp: boolean;
  refreshProjects: () => Promise<void>;
};

type AppLayoutProps = {
  health: Health | null;
  shellInfo: ShellInfo | null;
  mastraInfo: MastraInfo | null;
  projects: Project[];
  refreshProjects: () => Promise<void>;
};

function formatTimestamp(timestamp: string) {
  if (/^\d+$/.test(timestamp)) {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  }
  return new Date(timestamp).toLocaleString();
}

export function AppLayout({ health, shellInfo, mastraInfo, projects, refreshProjects }: AppLayoutProps) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const { bookId: urlBookId } = useParams<{ bookId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isHealthy = health?.status === 'ok';
  const isMastraUp = mastraInfo?.reachable === true;

  const activeBookId = urlBookId ?? selectedBookId;
  const hasBook = !!activeBookId;
  const isNewBookPage = location.pathname === '/new-book';

  const { setActiveBookId, setOnProjectCreated } = useAIChat();

  useEffect(() => {
    setActiveBookId(activeBookId ?? null);
  }, [activeBookId, setActiveBookId]);

  useEffect(() => {
    if (urlBookId) setSelectedBookId(urlBookId);
  }, [urlBookId]);

  useEffect(() => {
    setOnProjectCreated(() => () => {
      void refreshProjects();
    });
    return () => setOnProjectCreated(null);
  }, [refreshProjects, setOnProjectCreated]);

  function handleBookSelect(id: string) {
    setSelectedBookId(id);
    navigate(`/books/${id}/overview`);
  }

  const handleArchive = useCallback(async (id: string) => {
    try {
      await archiveProject(id);
      await refreshProjects();
      if (activeBookId === id) {
        setSelectedBookId(null);
        navigate('/');
      }
    } catch {
      void 0;
    }
  }, [activeBookId, refreshProjects, navigate]);

  const outletContext: AppLayoutContext = { projects, mastraInfo, shellInfo, isMastraUp, refreshProjects };

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <BookSidebar
        projects={projects}
        isHealthy={!!isHealthy}
        activeBookId={activeBookId ?? null}
        onBookSelect={handleBookSelect}
        onStatusClick={() => setStatusDialogOpen(true)}
        onArchive={handleArchive}
      />

      {hasBook || isNewBookPage ? (
        <Outlet context={outletContext} />
      ) : (
        <NoBookPage />
      )}

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>服务状态详情</DialogTitle>
          </DialogHeader>

          {health && (
            <div className="space-y-3">
              <StatusRow label="状态" value={health.status} highlight={health.status === 'ok'} />
              <StatusRow label="服务" value={health.service} />
              <StatusRow label="模式" value={health.mode} />
              <StatusRow label="API 地址" value={health.apiBase} mono />
              <StatusRow label="Mastra 地址" value={health.mastraBase} mono />
              <StatusRow label="更新时间" value={formatTimestamp(health.timestamp)} />
            </div>
          )}

          {mastraInfo && (
            <div className="mt-5 pt-5 border-t border-border space-y-3">
              <p className="text-primary text-xs tracking-widest uppercase mb-3">
                Mastra 智能体服务
              </p>
              <StatusRow label="可达性" value={mastraInfo.reachable ? '可达' : '未启动'} highlight={mastraInfo.reachable} />
              <StatusRow label="服务地址" value={mastraInfo.base_url} mono />
              <StatusRow label="网关入口" value={mastraInfo.gateway_url} mono />
              {!mastraInfo.reachable && (
                <p className="text-destructive text-xs leading-relaxed mt-3 font-mono">
                  pnpm --filter @novel-local-studio/mastra dev
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
