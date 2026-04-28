import { useCallback, useState } from 'react';
import { RiBookOpenLine, RiSparkling2Line, RiSettings3Line } from '@remixicon/react';
import { ChatPanel } from './chat/ChatPanel';
import { SettingsModal } from './settings/SettingsModal';
import { BookTree } from './library/BookTree';
import { ThreadList } from './library/ThreadList';
import { DocumentReader } from './library/DocumentReader';
import { SplashScreen } from './splash/SplashScreen';
import { isBrowserMode, type ServerInfo } from './lib/serverInfo';
import { makeLibraryApi } from './library/api';

const DEFAULT_THREAD_TITLE = '新会话';

export function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadTitle, setActiveThreadTitle] = useState<string | null>(null);

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
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-100"
            aria-label="设置"
            title="设置"
          >
            <RiSettings3Line className="size-4" />
          </button>
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
        <div className="flex items-center gap-2 text-neutral-300 text-sm font-medium px-3 py-2 border-b border-neutral-800">
          <RiSparkling2Line className="size-4" /> AI 总编辑
        </div>
        <div className="flex-1 min-h-0">
          <ChatPanel
            key={(activeBookId ?? 'none') + ':' + (activeThreadId ?? 'none')}
            backendUrl={info.url}
            activeBookId={activeBookId}
            activeThreadId={activeThreadId}
            onFirstUserMessage={handleFirstUserMessage}
          />
        </div>
      </aside>

      {settingsOpen && (
        <SettingsModal backendUrl={info.url} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
