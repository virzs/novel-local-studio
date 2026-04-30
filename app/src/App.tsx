import { useCallback, useMemo, useState } from 'react';
import {
  RiBookOpenLine,
  RiSparkling2Line,
  RiSettings3Line,
  RiTerminalBoxLine,
  RiArrowLeftLine,
} from '@remixicon/react';
import { ChatPanel } from './chat/ChatPanel';
import { SettingsModal } from './settings/SettingsModal';
import { BookTree } from './library/BookTree';
import { ThreadList } from './library/ThreadList';
import { DocumentReader } from './library/DocumentReader';
import { LogsModal } from './library/LogsModal';
import { SplashScreen } from './splash/SplashScreen';
import { isBrowserMode, type ServerInfo } from './lib/serverInfo';
import {
  makeLibraryApi,
  AGENT_LABELS,
  getThreadParentId,
  type AgentId,
  type ChatThread,
} from './library/api';

const DEFAULT_THREAD_TITLE = '新会话';

export function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<AgentId>('supervisor');
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [allThreads, setAllThreads] = useState<ChatThread[]>([]);

  const handleFirstUserMessage = useCallback(
    (text: string) => {
      if (!activeThreadId || activeThreadTitle !== DEFAULT_THREAD_TITLE) return;
      const api = makeLibraryApi(info?.url ?? '');
      void api.renameThread(activeThreadId, text.slice(0, 20)).then((updated) => {
        ThreadList.patchTitle(updated.id, updated.title ?? DEFAULT_THREAD_TITLE);
        setActiveThreadTitle(updated.title ?? DEFAULT_THREAD_TITLE);
      });
    },
    [activeThreadId, activeThreadTitle, info?.url],
  );

  const parentThread = useMemo(() => {
    const parentId = getThreadParentId(activeThread);
    if (!parentId) return null;
    return allThreads.find((t) => t.id === parentId) ?? null;
  }, [activeThread, allThreads]);

  const handleOpenSubThread = useCallback(
    (threadId: string) => {
      const found = allThreads.find((t) => t.id === threadId);
      if (!found) return;
      setActiveThreadId(found.id);
      setActiveThread(found);
      setActiveThreadTitle(found.title ?? DEFAULT_THREAD_TITLE);
      const agentRaw = found.metadata?.agentId;
      if (typeof agentRaw === 'string') {
        setActiveAgentId(agentRaw as AgentId);
      }
    },
    [allThreads],
  );

  if (!info) {
    return <SplashScreen onReady={setInfo} />;
  }

  return (
    <div className="h-full flex">
      <aside className="w-64 border-r border-neutral-800 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between text-neutral-300 text-sm font-medium">
          <span className="flex items-center gap-2">
            <RiBookOpenLine className="size-4" />
            Novel Local Studio
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLogsOpen(true)}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-100"
              aria-label="后端日志"
              title="后端日志"
            >
              <RiTerminalBoxLine className="size-4" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-100"
              aria-label="设置"
              title="设置"
            >
              <RiSettings3Line className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <BookTree
            backendUrl={info.url}
            selectedDocId={selectedDocId}
            onSelectDocument={setSelectedDocId}
            activeBookId={activeBookId}
            onActiveBookChange={setActiveBookId}
          />
        </div>

        <div className="shrink-0 max-h-48 min-h-0 overflow-y-auto border-t border-neutral-800 pt-2">
          <ThreadList
            backendUrl={info.url}
            activeBookId={activeBookId}
            activeThreadId={activeThreadId}
            onThreadSelect={setActiveThreadId}
            onActiveThreadTitleChange={setActiveThreadTitle}
            onActiveAgentIdChange={setActiveAgentId}
            onActiveThreadChange={setActiveThread}
            onThreadsLoaded={setAllThreads}
          />
        </div>

        <div className="text-[10px] text-neutral-600 border-t border-neutral-800 pt-2">
          ✅ 后端在线
          {isBrowserMode() && <span className="ml-1 text-amber-500">[浏览器模式]</span>}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <DocumentReader backendUrl={info.url} documentId={selectedDocId} />
      </main>

      <aside className="w-[420px] border-l border-neutral-800 flex flex-col">
        <div className="flex flex-col gap-1 px-3 py-2 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-300 text-sm font-medium">
            <RiSparkling2Line className="size-4" /> AI · {AGENT_LABELS[activeAgentId]}
          </div>
          {parentThread && (
            <button
              type="button"
              onClick={() => handleOpenSubThread(parentThread.id)}
              className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-indigo-300 transition-colors w-fit"
              title="返回父对话"
            >
              <RiArrowLeftLine className="size-3" />
              <span className="truncate max-w-[200px]">
                {parentThread.title ?? DEFAULT_THREAD_TITLE}
              </span>
              <span className="text-neutral-700">/</span>
              <span className="text-neutral-400 truncate max-w-[120px]">
                {activeThread?.title ?? DEFAULT_THREAD_TITLE}
              </span>
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            key={(activeBookId ?? 'none') + ':' + (activeThreadId ?? 'none') + ':' + activeAgentId}
            backendUrl={info.url}
            activeBookId={activeBookId}
            activeThreadId={activeThreadId}
            activeAgentId={activeAgentId}
            onFirstUserMessage={handleFirstUserMessage}
            onOpenSubThread={handleOpenSubThread}
          />
        </div>
      </aside>

      {settingsOpen && (
        <SettingsModal backendUrl={info.url} onClose={() => setSettingsOpen(false)} />
      )}
      {logsOpen && <LogsModal backendUrl={info.url} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
