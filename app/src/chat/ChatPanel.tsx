import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react';
import { useMessageError, useThreadMessages } from '@assistant-ui/core/react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { useMemo, useRef, useEffect } from 'react';
import { RiSendPlane2Line, RiSparkling2Line, RiErrorWarningLine } from '@remixicon/react';

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
  onFirstUserMessage,
}: {
  backendUrl: string;
  activeBookId: string | null;
  activeThreadId: string | null;
  onFirstUserMessage?: (text: string) => void;
}) {
  const activeBookIdRef = useRef(activeBookId);
  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeBookIdRef.current = activeBookId;
  }, [activeBookId]);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${backendUrl}/api/chat/supervisor`,
        body: () => ({ bookId: activeBookIdRef.current, threadId: activeThreadIdRef.current }),
        fetch: detailedFetch,
      }),
    [backendUrl],
  );

  const runtime = useChatRuntime({
    transport,
    onError: (err) => {
      console.error('[chat] error:', err);
    },
  });

  if (activeThreadId === null) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-neutral-600">
        请选择一个会话
      </div>
    );
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {onFirstUserMessage && (
        <FirstMessageWatcher onFirstUserMessage={onFirstUserMessage} />
      )}
      <ThreadPrimitive.Root className="flex flex-col h-full">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <ThreadPrimitive.Empty>
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <RiSparkling2Line className="size-4" />
              发送消息开始与 Supervisor 对话。
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
            placeholder="问 Supervisor…（Enter 发送，Shift+Enter 换行）"
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
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-neutral-100 text-neutral-900 px-3 py-2 text-sm whitespace-pre-wrap">
        <MessagePrimitive.Parts />
      </div>
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

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[85%] rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-100 px-3 py-2 text-sm whitespace-pre-wrap">
        <MessagePrimitive.Parts />
        <AssistantErrorBlock />
      </div>
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
