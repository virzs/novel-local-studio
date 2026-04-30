import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
} from '@assistant-ui/react';
import { useMessageError, useThreadMessages } from '@assistant-ui/core/react';
import type { ToolCallMessagePartProps } from '@assistant-ui/core/react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import type { UIMessage } from 'ai';
import { useMemo, useRef, useEffect, useState, createContext, useContext } from 'react';
import {
  RiSendPlane2Line,
  RiSparkling2Line,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiCheckLine,
  RiTerminalLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiExternalLinkLine,
} from '@remixicon/react';
import { makeLibraryApi, AGENT_LABELS, type AgentId } from '@/library/api';
import { BookTree } from '@/library/BookTree';

const SubThreadOpenerContext = createContext<((threadId: string) => void) | null>(null);

async function detailedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.ok) return res;
  let detail = '';
  try {
    const cloned = res.clone();
    const text = await cloned.text();
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: unknown; message?: unknown };
        const errVal = json?.error ?? json?.message;
        detail = typeof errVal === 'string' && errVal ? errVal : text;
      } catch {
        detail = text;
      }
    }
  } catch {
    void 0;
  }
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  throw new Error(`HTTP ${res.status} ${res.statusText} @ ${url}${detail ? ` — ${detail}` : ''}`);
}

export function ChatPanel({
  backendUrl,
  activeBookId,
  activeThreadId,
  activeAgentId,
  onFirstUserMessage,
  onOpenSubThread,
}: {
  backendUrl: string;
  activeBookId: string | null;
  activeThreadId: string | null;
  activeAgentId: string;
  onFirstUserMessage?: (text: string) => void;
  onOpenSubThread?: (threadId: string) => void;
}) {
  const activeBookIdRef = useRef(activeBookId);
  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeBookIdRef.current = activeBookId;
  }, [activeBookId]);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeThreadId) {
      setInitialMessages(null);
      return;
    }
    let cancelled = false;
    setInitialMessages(null);
    setLoadError(null);
    const api = makeLibraryApi(backendUrl);
    void api
      .getThreadMessages(activeThreadId)
      .then((msgs) => {
        if (!cancelled) setInitialMessages(msgs as UIMessage[]);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(String(e));
          setInitialMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, backendUrl]);

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${backendUrl}/api/chat/${activeAgentId}`,
        body: () => ({ bookId: activeBookIdRef.current, threadId: activeThreadIdRef.current }),
        fetch: detailedFetch,
      }),
    [backendUrl, activeAgentId],
  );

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages ?? [],
    onError: (err) => {
      console.error('[chat] error:', err);
    },
    onFinish: () => {
      const bookId = activeBookIdRef.current;
      if (bookId) BookTree.reloadTree(bookId);
    },
  });

  const agentLabel = AGENT_LABELS[activeAgentId as AgentId] ?? activeAgentId;

  if (activeThreadId === null) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-600">
        请选择一个会话
      </div>
    );
  }

  if (initialMessages === null) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-600">
        加载会话历史…
      </div>
    );
  }

  return (
    <SubThreadOpenerContext.Provider value={onOpenSubThread ?? null}>
      <AssistantRuntimeProvider runtime={runtime}>
      {loadError && (
        <div className="px-3 py-2 border-b border-red-900/40 bg-red-950/30 text-[11px] text-red-300">
          历史加载失败：{loadError}
        </div>
      )}
      {onFirstUserMessage && (
        <FirstMessageWatcher onFirstUserMessage={onFirstUserMessage} />
      )}
      <ThreadPrimitive.Root className="flex flex-col h-full">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <ThreadPrimitive.Empty>
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <RiSparkling2Line className="size-4" />
              发送消息开始与 {agentLabel} 对话。
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </ThreadPrimitive.Viewport>

        <ComposerPrimitive.Root className="border-t border-neutral-800 p-2 flex items-end gap-2">
          <ComposerPrimitive.Input
            className="flex-1 resize-none bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 max-h-40"
            placeholder={`问 ${agentLabel}…（Enter 发送，Shift+Enter 换行）`}
            rows={1}
            autoFocus
          />
          <ComposerPrimitive.Send asChild>
            <button
              type="submit"
              className="shrink-0 rounded-md bg-neutral-100 text-neutral-900 hover:bg-white p-2 disabled:opacity-40"
              aria-label="发送"
            >
              <RiSendPlane2Line className="size-4" />
            </button>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </SubThreadOpenerContext.Provider>
  );
}

function MessageActionBar({ align }: { align: 'left' | 'right' }) {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="never"
      className={`mt-1 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      <ActionBarPrimitive.Copy
        aria-label="复制"
        title="复制"
        className="group/copy rounded p-1 text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/60 data-[copied=true]:text-emerald-400"
      >
        <RiFileCopyLine className="size-3.5 group-data-[copied=true]/copy:hidden" />
        <RiCheckLine className="size-3.5 hidden group-data-[copied=true]/copy:block" />
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="group/msg flex flex-col items-end">
      <div className="max-w-[85%] rounded-lg bg-neutral-100 text-neutral-900 px-3 py-2 text-sm whitespace-pre-wrap">
        <MessagePrimitive.Parts />
      </div>
      <MessageActionBar align="right" />
    </MessagePrimitive.Root>
  );
}

function AssistantErrorBlock() {
  const error = useMessageError();
  if (error === undefined) return null;
  const text =
    typeof error === 'string'
      ? error
      : typeof error === 'number' || typeof error === 'boolean'
        ? String(error)
        : (() => {
            try {
              return JSON.stringify(error, null, 2);
            } catch {
              return String(error);
            }
          })();
  return (
    <div className="mt-2 rounded-md border border-red-900/60 bg-red-950/40 px-2.5 py-2 flex items-start gap-2">
      <RiErrorWarningLine className="size-4 shrink-0 mt-[1px] text-red-400" />
      <pre className="flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-red-300">
        {text}
      </pre>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 text-xs text-neutral-400" aria-label="思考中">
      <span className="flex items-end gap-1 h-3">
        <span className="size-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="size-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="size-1.5 rounded-full bg-indigo-400 animate-bounce" />
      </span>
      <span>思考中…</span>
    </div>
  );
}

const TOOL_LABEL_MAP: Record<string, string> = {
  listBooks: '查看书籍列表',
  getDocumentTree: '查看文档目录',
  readDocument: '读取文档',
  searchDocuments: '检索文档',
  createDocument: '创建文档',
  updateDocument: '修改文档',
  deleteDocument: '删除文档',
  delegateToAgent: '委派子智能体',
  architect: '委派 · 架构师',
  chronicler: '委派 · 执笔者',
  editor: '委派 · 润色师',
  loreKeeper: '委派 · 设定守护者',
};

const SUBAGENT_LABEL_MAP: Record<string, string> = {
  architect: '架构师',
  chronicler: '执笔者',
  editor: '润色师',
  loreKeeper: '设定守护者',
};

function getToolDisplayLabel(toolName: string): { primary: string; secondary: string | null } {
  const label = TOOL_LABEL_MAP[toolName];
  if (label) return { primary: label, secondary: toolName };
  return { primary: toolName, secondary: null };
}

function ToolCallCard({ toolName, argsText, result, isError, status }: ToolCallMessagePartProps) {
  const [open, setOpen] = useState(false);
  const running = status.type === 'running';
  const failed = isError === true;
  const { primary, secondary } = getToolDisplayLabel(toolName);
  const openSubThread = useContext(SubThreadOpenerContext);

  let resultText: string | undefined;
  if (result !== undefined) {
    resultText =
      typeof result === 'string'
        ? result
        : (() => {
            try {
              return JSON.stringify(result, null, 2);
            } catch {
              return String(result);
            }
          })();
  }

  let delegationInfo: { threadId: string; agentLabel: string } | null = null;
  if (
    toolName === 'delegateToAgent' &&
    !failed &&
    result &&
    typeof result === 'object' &&
    !Array.isArray(result)
  ) {
    const r = result as { threadId?: unknown; agentId?: unknown };
    if (typeof r.threadId === 'string' && r.threadId) {
      const agentId = typeof r.agentId === 'string' ? r.agentId : '';
      delegationInfo = {
        threadId: r.threadId,
        agentLabel: SUBAGENT_LABEL_MAP[agentId] ?? agentId ?? '子智能体',
      };
    }
  }

  return (
    <div
      className={`my-1 rounded-md border text-xs font-mono ${
        failed
          ? 'border-red-900/60 bg-red-950/20'
          : 'border-neutral-700/60 bg-neutral-800/40'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <RiTerminalLine className="size-3.5 shrink-0 text-indigo-400" />
        <span className="flex-1 truncate text-neutral-200 font-sans">
          {primary}
          {secondary && (
            <span className="ml-1.5 text-[10px] text-neutral-500 font-mono">{secondary}</span>
          )}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-sans ${
            running
              ? 'bg-indigo-900/50 text-indigo-300 animate-pulse'
              : failed
                ? 'bg-red-900/50 text-red-300'
                : 'bg-neutral-700/60 text-neutral-400'
          }`}
        >
          {running ? '调用中' : failed ? '失败' : '完成'}
        </span>
        {open ? (
          <RiArrowDownSLine className="size-3.5 shrink-0 text-neutral-500" />
        ) : (
          <RiArrowRightSLine className="size-3.5 shrink-0 text-neutral-500" />
        )}
      </button>

      {delegationInfo && openSubThread && (
        <div className="border-t border-neutral-700/40 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => openSubThread(delegationInfo!.threadId)}
            className="flex items-center gap-1.5 text-[11px] text-indigo-300 hover:text-indigo-200 font-sans"
          >
            <RiExternalLinkLine className="size-3.5" />
            打开 {delegationInfo.agentLabel} 子对话
          </button>
        </div>
      )}

      {open && (
        <div className="border-t border-neutral-700/40 px-2.5 py-2 space-y-2">
          {argsText && (
            <div>
              <div className="text-[10px] text-neutral-500 mb-1 font-sans">参数</div>
              <pre className="whitespace-pre-wrap break-all text-neutral-300 leading-relaxed">
                {argsText}
              </pre>
            </div>
          )}
          {resultText !== undefined && (
            <div>
              <div className="text-[10px] text-neutral-500 mb-1 font-sans">结果</div>
              <pre
                className={`whitespace-pre-wrap break-all leading-relaxed ${
                  failed ? 'text-red-300' : 'text-neutral-300'
                }`}
              >
                {resultText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group/msg flex flex-col items-start max-w-[85%]">
      <div className="text-sm text-neutral-100 whitespace-pre-wrap w-full">
        <MessagePrimitive.If hasContent>
          <MessagePrimitive.Parts
            components={{
              tools: { Fallback: ToolCallCard },
            }}
          />
        </MessagePrimitive.If>
        <MessagePrimitive.If hasContent={false}>
          <TypingIndicator />
        </MessagePrimitive.If>
        <AssistantErrorBlock />
      </div>
      <MessageActionBar align="left" />
    </MessagePrimitive.Root>
  );
}

function FirstMessageWatcher({ onFirstUserMessage }: { onFirstUserMessage: (text: string) => void }) {
  const messages = useThreadMessages();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    const first = messages.find((m) => m.role === 'user');
    if (!first) return;
    const part = first.content.find((p) => p.type === 'text');
    if (!part || part.type !== 'text') return;
    firedRef.current = true;
    onFirstUserMessage(part.text);
  }, [messages, onFirstUserMessage]);

  return null;
}
