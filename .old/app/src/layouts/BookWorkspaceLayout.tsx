import { useState, useRef, useEffect } from 'react';
import { Outlet, useOutletContext, useParams, useLocation, useNavigate } from 'react-router-dom';
import { AIChatPanel, ConversationsSidebar } from '../components/business/chat/AIChatPanel';
import { useAIChat } from '../contexts/AIChatContext';
import {
  OverviewIcon, WorldIcon, OutlineIcon, WritingIcon, ReviewIcon, ReadingIcon,
  CloseIcon, HistoryIcon, ChevronLeftIcon, ChevronRightIcon, SparkIcon,
} from '../components/business/shared/Icons';
import { cn } from '../lib/utils';
import type { AppLayoutContext } from './AppLayout';

const WORKSPACE_NAV = [
  { key: 'overview', label: '概览', Icon: OverviewIcon },
  { key: 'world', label: '世界设定', Icon: WorldIcon },
  { key: 'outline', label: '提纲', Icon: OutlineIcon },
  { key: 'writing', label: '写作', Icon: WritingIcon },
  { key: 'review', label: '审阅', Icon: ReviewIcon },
  { key: 'reading', label: '阅读', Icon: ReadingIcon },
] as const;

const CONTENT_PAGE_KEYS = ['overview', 'world', 'outline', 'writing', 'review', 'reading'] as const;

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="w-3 flex-shrink-0 cursor-col-resize relative group select-none"
      onMouseDown={onMouseDown}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-primary/40 transition-colors" />
    </div>
  );
}

export function BookWorkspaceLayout() {
  const ctx = useOutletContext<AppLayoutContext>();
  const { bookId } = useParams<{ bookId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeConversationId,
    setActiveConversationId,
    setPendingMessage,
    setPageContext,
    triggerNewConversation,
    convListRefreshKey,
  } = useAIChat();

  const locationState = location.state as {
    fromAICreation?: boolean;
    conversationId?: string | null;
    continuationMessage?: string;
      subtaskView?: {
        title?: string;
        agentId?: string;
        conversationId?: string | null;
        parentConversationId?: string | null;
        messages: Array<{
          id: string;
        role: 'user' | 'assistant';
        content: Array<{ type: 'text'; text: string }>;
      }>;
    };
  } | null;

  const isSubtaskChat = location.pathname === `/books/${bookId}/chat` && !!locationState?.subtaskView;
  const subtaskView = isSubtaskChat ? locationState?.subtaskView ?? null : null;

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [convSidebarVisible, setConvSidebarVisible] = useState(false);
  const [contentWidth, setContentWidth] = useState(480);
  const [navWidth, setNavWidth] = useState(200);

  const contentWidthRef = useRef(contentWidth);
  const navWidthRef = useRef(navWidth);
  contentWidthRef.current = contentWidth;
  navWidthRef.current = navWidth;
  const containerRef = useRef<HTMLDivElement>(null);
  const handledAICreationLocationKeyRef = useRef<string | null>(null);
  const pendingContinuationTargetRef = useRef<string | null>(null);
  const pendingContinuationMessageRef = useRef<string | null>(null);
  const subtaskParentConversationRef = useRef<string | null>(null);
  const wasSubtaskRouteRef = useRef(false);

  useEffect(() => {
    const fromAICreation = locationState?.fromAICreation;
    const conversationId = locationState?.conversationId ?? null;
    const continuationMessage = locationState?.continuationMessage?.trim() || '';
    if (!fromAICreation || !conversationId) return;
    if (handledAICreationLocationKeyRef.current === location.key) return;

    handledAICreationLocationKeyRef.current = location.key;
    pendingContinuationTargetRef.current = conversationId;
    pendingContinuationMessageRef.current = continuationMessage || null;
    setActiveConversationId(conversationId);
  }, [location.key, locationState?.fromAICreation, locationState?.conversationId, locationState?.continuationMessage, setActiveConversationId]);

  useEffect(() => {
    const targetConversationId = pendingContinuationTargetRef.current;
    const continuationMessage = pendingContinuationMessageRef.current;
    if (!targetConversationId || !continuationMessage) return;
    if (activeConversationId !== targetConversationId) return;

    setPendingMessage(continuationMessage);
    pendingContinuationTargetRef.current = null;
    pendingContinuationMessageRef.current = null;
  }, [activeConversationId, setPendingMessage]);

  useEffect(() => {
    if (subtaskView) {
      wasSubtaskRouteRef.current = true;
      subtaskParentConversationRef.current = subtaskView.parentConversationId ?? activeConversationId;
      setPageContext({
        label: subtaskView.title ? `子对话 · ${subtaskView.title}` : '子对话',
        pageKey: 'books',
        meta: { bookId, subtask: true },
      });
      return;
    }

    if (wasSubtaskRouteRef.current) {
      wasSubtaskRouteRef.current = false;
      const parentConversationId = subtaskParentConversationRef.current;
      if (parentConversationId) {
        setActiveConversationId(parentConversationId);
      }
      subtaskParentConversationRef.current = null;
      setPageContext(null);
    }
  }, [activeConversationId, bookId, setActiveConversationId, setPageContext, subtaskView]);

  function startResize(e: React.MouseEvent, target: 'content' | 'nav') {
    e.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    const startX = e.clientX;
    const startW = target === 'content' ? contentWidthRef.current : navWidthRef.current;
    const min = target === 'content' ? 280 : 160;
    const HANDLE_W = 12;
    const capturedConvOpen = convSidebarVisible;
    const capturedNavCollapsed = navCollapsed;
    const capturedContentVisible = contentPanelVisible;

    const onMove = (ev: MouseEvent) => {
      const containerW = containerRef.current?.clientWidth ?? window.innerWidth;
      const aiMin = capturedConvOpen ? 176 + 360 : 360;
      const navCurrent = capturedNavCollapsed ? 56 : navWidthRef.current;
      const handles = ((capturedContentVisible ? 1 : 0) + (!capturedNavCollapsed ? 1 : 0)) * HANDLE_W;
      const max =
        target === 'content'
          ? Math.max(min, containerW - aiMin - navCurrent - handles)
          : Math.max(min, containerW - aiMin - contentWidthRef.current - handles);
      const newW = Math.max(min, Math.min(max, startW - (ev.clientX - startX)));
      if (target === 'content') setContentWidth(newW);
      else setNavWidth(newW);
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const currentPageKey = CONTENT_PAGE_KEYS.find(
    (k) =>
      location.pathname === `/books/${bookId}/${k}` ||
      location.pathname.startsWith(`/books/${bookId}/${k}/`),
  ) ?? null;
  const contentPanelVisible = !!currentPageKey;

  function handleNavToggle() {
    if (navCollapsed) {
      const containerW = containerRef.current?.clientWidth ?? window.innerWidth;
      const aiMin = convSidebarVisible ? 176 + 360 : 360;
      const handleCount = (contentPanelVisible ? 1 : 0) + 1;
      const maxContent = containerW - aiMin - navWidthRef.current - handleCount * 12;
      if (contentPanelVisible && maxContent >= 280) {
        setContentWidth((w) => Math.min(w, maxContent));
      }
    }
    setNavCollapsed((v) => !v);
  }

  function handleNavClick(key: string) {
    const targetPath = `/books/${bookId}/${key}`;
    const isCurrent =
      location.pathname === targetPath || location.pathname.startsWith(targetPath + '/');
    navigate(isCurrent ? `/books/${bookId}` : targetPath);
  }

  const bookTitle = ctx.projects.find((p) => p.id === bookId)?.name ?? '工作台';
  const currentPageLabel = WORKSPACE_NAV.find((n) => n.key === currentPageKey)?.label ?? '';

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden bg-background text-foreground">
      <div
        className="flex-1 flex flex-col min-h-0"
        style={{ minWidth: convSidebarVisible ? 176 + 360 : 360 }}
      >
        <div className="flex items-center justify-between px-4 h-14 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            {subtaskView && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="返回主对话"
              >
                <ChevronLeftIcon />
              </button>
            )}
            <span className="text-primary flex-shrink-0">
              <SparkIcon />
            </span>
            <span className="text-sm font-medium text-foreground">AI 创作助手</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConvSidebarVisible((v) => !v)}
              className={cn(
                'p-1.5 rounded-sm transition-colors',
                convSidebarVisible
                  ? 'text-primary bg-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              title="对话历史"
            >
              <HistoryIcon />
            </button>
          </div>
        </div>
        <div className="flex-1 flex min-w-0 min-h-0">
          {convSidebarVisible && (
            <div className="w-44 flex-shrink-0 border-r border-border">
              <ConversationsSidebar
                agentId="preset-director"
                projectId={bookId!}
                activeId={activeConversationId}
                onSelect={(conv) => setActiveConversationId(conv.id)}
                onNew={() => triggerNewConversation?.()}
                refreshKey={convListRefreshKey}
              />
            </div>
          )}
          <div className="flex-1 min-w-[360px] min-h-0 overflow-hidden">
            <AIChatPanel
              key={`${bookId}:${subtaskView ? 'subtask' : 'main'}`}
              hideConversationsSidebar
              pendingMessageRequiresExistingThread={!subtaskView}
              initialAgentId={subtaskView?.agentId}
              initialConversationId={subtaskView?.conversationId}
              seedMessages={subtaskView?.messages}
            />
          </div>
        </div>
      </div>

      {contentPanelVisible && (
        <>
          <ResizeHandle onMouseDown={(e) => startResize(e, 'content')} />
          <div
            className="flex flex-col flex-shrink-0 min-h-0 overflow-hidden"
            style={{ width: contentWidth }}
          >
            <div className="flex items-center gap-2 px-4 h-14 border-b border-border flex-shrink-0">
              <span className="text-sm font-medium text-foreground truncate">{currentPageLabel}</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <Outlet context={ctx} />
            </div>
          </div>
        </>
      )}

      {!navCollapsed && (
        <ResizeHandle onMouseDown={(e) => startResize(e, 'nav')} />
      )}

      <div
        className={cn('flex flex-col flex-shrink-0', navCollapsed && 'border-l border-border')}
        style={{ width: navCollapsed ? 56 : navWidth }}
      >
        <div className="flex items-center justify-between px-2 h-14 border-b border-border flex-shrink-0">
          <button
            type="button"
            onClick={handleNavToggle}
            className={cn(
              'flex-shrink-0 p-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              navCollapsed && 'mx-auto',
            )}
            title={navCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {navCollapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </button>
          {!navCollapsed && (
            <span className="text-sm font-medium text-foreground truncate flex-1 pl-1">
              {bookTitle}
            </span>
          )}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {WORKSPACE_NAV.map(({ key, label, Icon }) => {
            const isActive =
              location.pathname === `/books/${bookId}/${key}` ||
              location.pathname.startsWith(`/books/${bookId}/${key}/`);
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleNavClick(key)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  navCollapsed ? 'justify-center' : 'justify-start',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
                title={navCollapsed ? label : undefined}
              >
                <span className="flex-shrink-0">
                  <Icon />
                </span>
                {!navCollapsed && <span className="truncate">{label}</span>}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
