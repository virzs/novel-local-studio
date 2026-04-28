"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";
import {
  useAui,
  useScrollLock,
  type ToolCallMessagePartComponent,
  type ToolCallMessagePartStatus,
} from "@assistant-ui/react";
import type { ThreadMessage } from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useAIChat } from "@/contexts/AIChatContext";
import { cn } from "@/lib/utils";

const ANIMATION_DURATION = 200;

const AGENT_NAME_MAP: Record<string, string> = {
  "agent-preset-worldbuilder": "世界构建师",
  "agent-preset-character-designer": "角色设计师",
  "agent-preset-outline-planner": "大纲规划师",
  "agent-preset-writer": "章节写手",
  "agent-preset-reviewer": "审校员",
  "agent-preset-chapter-planner": "章节规划师",
  "agent-preset-dialogue": "对话创作",
  "agent-preset-polisher": "文稿润色",
  "agent-preset-reader-feedback": "读者反馈",
};

function resolveAgentName(toolName: string): string {
  if (toolName in AGENT_NAME_MAP) return AGENT_NAME_MAP[toolName];
  return toolName.startsWith("agent-preset-")
    ? toolName.slice("agent-preset-".length)
    : toolName;
}

function extractPrompt(argsText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(argsText);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "prompt" in parsed &&
      typeof (parsed as Record<string, unknown>).prompt === "string"
    ) {
      return (parsed as Record<string, string>).prompt;
    }
  } catch {
    return null;
  }
  return null;
}

function taskSummary(argsText: string): string {
  const prompt = extractPrompt(argsText);
  if (!prompt) return "";
  const oneline = prompt.replace(/\n+/g, " ").trim();
  return oneline.length > 80 ? oneline.slice(0, 80) + "…" : oneline;
}

function resultPreview(result: unknown): string {
  if (result === undefined || result === null) return "";
  const text =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const oneline = text.replace(/\n+/g, " ").trim();
  return oneline.length > 100 ? oneline.slice(0, 100) + "…" : oneline;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type CardStatus = ToolCallMessagePartStatus["type"];

function isErrorResult(result: unknown, isErrorFlag?: boolean): boolean {
  if (isErrorFlag === true) return true;
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (record.error === true) return true;
  if (typeof record.message === "string") {
    const message = record.message.toLowerCase();
    if (
      message.includes("failed") ||
      message.includes("error") ||
      message.includes("invalid")
    ) {
      return true;
    }
  }
  return false;
}

function getDisplayStatus(
  status: ToolCallMessagePartStatus | undefined,
  result: unknown,
  isErrorFlag?: boolean,
): ToolCallMessagePartStatus {
  if (status) {
    if (
      status.type === "complete" &&
      isErrorResult(result, isErrorFlag)
    ) {
      return {
        type: "incomplete",
        reason: "error",
        error:
          typeof result === "object" && result !== null && "message" in result
            ? (result as Record<string, unknown>).message
            : result,
      };
    }
    return status;
  }

  if (isErrorResult(result, isErrorFlag)) {
    return {
      type: "incomplete",
      reason: "error",
      error:
        typeof result === "object" && result !== null && "message" in result
          ? (result as Record<string, unknown>).message
          : result,
    };
  }

  return { type: "running" };
}

function normalizeSubtaskMessages(messages: readonly ThreadMessage[]): Array<{
  id: string;
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
}> {
  return messages
    .filter((message): message is ThreadMessage & { role: "user" | "assistant" } =>
      message.role === "user" || message.role === "assistant",
    )
    .map((message) => {
      const chunks: string[] = [];
      for (const part of message.content) {
        if (part.type === 'text') {
          if (part.text) chunks.push(part.text);
          continue;
        }
        if (part.type === 'tool-call') {
          const resultText = part.result == null
            ? ''
            : typeof part.result === 'string'
              ? part.result
              : JSON.stringify(part.result, null, 2);
          chunks.push(`[${part.toolName}]${resultText ? `\n${resultText}` : ''}`);
        }
      }

      return {
        id: message.id,
        role: message.role,
        content: [{ type: 'text' as const, text: chunks.join('\n\n') }],
      };
    });
}

type SubtaskRouteState = {
  subtaskView: {
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
  parentPath: string;
};

function AgentDelegationCardRoot({
  statusType,
  className,
  children,
  open,
  onOpenChange,
  defaultOpen = false,
}: {
  statusType: CardStatus;
  className?: string;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
}) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) lockScroll();
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [lockScroll, isControlled, onOpenChange],
  );

  const isRunning = statusType === "running";
  const isComplete = statusType === "complete";
  const isError = statusType === "incomplete";

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="agent-delegation-card-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-agent-delegation-card group/agent-card my-2 w-full rounded-lg border py-3",
        "border-l-4",
        isRunning && "border-l-primary bg-primary/5",
        isComplete && "border-l-green-500 bg-green-500/5",
        isError && "border-l-destructive bg-destructive/5",
        !isRunning && !isComplete && !isError &&
          "border-l-muted-foreground/40 bg-muted/20",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
    >
      {children}
    </Collapsible>
  );
}

function AgentDelegationCardTrigger({
  agentName,
  taskText,
  status,
  className,
}: {
  agentName: string;
  taskText: string;
  status?: ToolCallMessagePartStatus;
  className?: string;
}) {
  const statusType = status?.type ?? "running";
  const isRunning = statusType === "running";
  const isComplete = statusType === "complete";
  const isError =
    statusType === "incomplete" &&
    status !== undefined &&
    status.type === "incomplete" &&
    status.reason !== "cancelled";
  const isCancelled =
    statusType === "incomplete" &&
    status !== undefined &&
    status.type === "incomplete" &&
    status.reason === "cancelled";

  return (
    <CollapsibleTrigger
      data-slot="agent-delegation-card-trigger"
      className={cn(
        "aui-agent-delegation-card-trigger group/trigger flex w-full items-center gap-2 px-4 text-sm transition-colors",
        className,
      )}
    >
      {isRunning ? (
        <LoaderIcon className="size-4 shrink-0 animate-spin text-primary" />
      ) : isComplete ? (
        <CheckIcon className="size-4 shrink-0 text-green-500" />
      ) : (
        <XCircleIcon
          className={cn(
            "size-4 shrink-0",
            isError ? "text-destructive" : "text-muted-foreground",
          )}
        />
      )}

      <BotIcon
        className={cn(
          "size-4 shrink-0",
          isRunning && "text-primary",
          isComplete && "text-green-600",
          isError && "text-destructive",
          isCancelled && "text-muted-foreground",
        )}
      />

      <span
        data-slot="agent-delegation-card-label"
        className={cn(
          "relative inline-block grow text-left leading-none",
          isCancelled && "text-muted-foreground line-through",
          isError && "text-destructive/90",
        )}
      >
        <span>
          <b>{agentName}</b>
          {taskText && (
            <span className="ml-2 font-normal text-muted-foreground">
              {taskText}
            </span>
          )}
        </span>

        {isRunning && (
          <span
            aria-hidden
            data-slot="agent-delegation-card-shimmer"
            className="shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            <b>{agentName}</b>
            {taskText && (
              <span className="ml-2 font-normal">{taskText}</span>
            )}
          </span>
        )}
      </span>

      {isRunning && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          正在执行
        </span>
      )}
      {isComplete && (
        <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
          已完成
        </span>
      )}
      {isError && (
        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          执行失败
        </span>
      )}

      <span
        className={cn(
          "shrink-0 text-xs text-muted-foreground",
          "group-data-[state=open]/trigger:hidden",
        )}
      >
        查看详情
      </span>
      <span
        className={cn(
          "shrink-0 text-xs text-muted-foreground",
          "group-data-[state=closed]/trigger:hidden",
        )}
      >
        收起
      </span>

      <ChevronDownIcon
        className={cn(
          "size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function AgentDelegationCardContent({
  prompt,
  result,
  status,
  className,
  onRetry,
}: {
  prompt: string | null;
  result: unknown;
  status?: ToolCallMessagePartStatus;
  className?: string;
  onRetry?: () => void;
}) {
  const isError =
    status?.type === "incomplete" && status.reason !== "cancelled";
  const contentScrollRef = useRef<HTMLDivElement>(null);

  return (
    <CollapsibleContent
      data-slot="agent-delegation-card-content"
      className={cn(
        "aui-agent-delegation-card-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
    >
      <div
        ref={contentScrollRef}
        className="mt-3 flex flex-col gap-3 border-t pt-2 px-4"
      >
        {prompt && (
          <div>
            <p className="mb-1 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
              委托提示词
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed">
              {prompt}
            </pre>
          </div>
        )}

        {result !== undefined && (
          <div className="border-t border-dashed pt-2">
            <p className="mb-1 font-semibold text-xs text-muted-foreground uppercase tracking-wide">
              执行结果
            </p>
            <pre
              className={cn(
                "whitespace-pre-wrap rounded-md px-3 py-2 text-xs leading-relaxed",
                isError
                  ? "bg-destructive/5 text-destructive/90"
                  : "bg-green-500/5",
              )}
            >
              {typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
        {isError && (
          <div className="border-t border-dashed pt-2 flex flex-col gap-2">
            {(() => {
              if (status?.type !== "incomplete" || status.error == null) return null;
              const errText =
                typeof status.error === "string"
                  ? status.error
                  : String(JSON.stringify(status.error));
              return (
                <>
                  <p className="font-semibold text-xs text-destructive uppercase tracking-wide">
                    执行失败
                  </p>
                  <p className="text-destructive/80 text-xs">{errText}</p>
                </>
              );
            })()}
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs w-fit border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={onRetry}
              >
                <RefreshCwIcon className="size-3.5 mr-1.5" />
                重试子任务
              </Button>
            )}
          </div>
        )}
      </div>
    </CollapsibleContent>
  );
}

function AgentDelegationCardPreview({
  result,
  status,
}: {
  result: unknown;
  status?: ToolCallMessagePartStatus;
}) {
  const isComplete = status?.type === "complete";
  const preview = isComplete ? resultPreview(result) : null;

  if (!preview) return null;

  return (
    <p
      data-slot="agent-delegation-card-preview"
      className={cn(
        "px-4 pt-1 text-xs text-muted-foreground leading-snug",
        "group-data-[state=open]/agent-card:hidden",
      )}
    >
      {preview}
    </p>
  );
}

const AgentDelegationCardImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
  messages,
  isError: isErrorProp,
}) => {
  const displayStatus = useMemo(
    () => getDisplayStatus(status, result, isErrorProp),
    [status, result, isErrorProp],
  );
  const statusType = displayStatus.type;
  const agentName = resolveAgentName(toolName);
  const taskText = taskSummary(argsText);
  const prompt = extractPrompt(argsText);
  const navigate = useNavigate();
  const location = useLocation();
  const { activeBookId, activeConversationId } = useAIChat();
  const resultRecord = isRecord(result) ? result : null;
  const subtaskConversationId = typeof resultRecord?.subAgentThreadId === 'string'
    ? resultRecord.subAgentThreadId
    : typeof resultRecord?.threadId === 'string'
      ? resultRecord.threadId
      : null;
  const hasSubtaskEntry = !!subtaskConversationId || !!(messages && messages.length > 0);

  const handleOpenSubtask = useCallback(() => {
    if (!activeBookId || !hasSubtaskEntry) return;
    const state: SubtaskRouteState = {
      subtaskView: {
        title: agentName,
        agentId: toolName.startsWith('agent-') ? toolName.slice('agent-'.length) : undefined,
        conversationId: subtaskConversationId,
        parentConversationId: activeConversationId,
        messages: messages ? normalizeSubtaskMessages(messages) : [],
      },
      parentPath: location.pathname,
    };
    navigate(`/books/${activeBookId}/chat`, { state });
  }, [activeBookId, activeConversationId, agentName, hasSubtaskEntry, location.pathname, messages, navigate, subtaskConversationId, toolName]);

  const aui = useAui();
  const handleRetry = useCallback(() => {
    if (!prompt) return;
    const composer = aui.composer();
    composer.setText(prompt);
    composer.send();
  }, [aui, prompt]);

  const hasRetry =
    displayStatus.type === "incomplete" &&
    displayStatus.reason !== "cancelled" &&
    !!prompt;

  if (hasSubtaskEntry) {
    return (
      <div className="my-2">
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-left text-sm font-normal text-primary whitespace-normal"
          onClick={handleOpenSubtask}
        >
          <span className="inline-flex items-center gap-1.5">
            {statusType === "running" ? (
              <LoaderIcon className="size-3.5 shrink-0 animate-spin" />
            ) : statusType === "complete" ? (
              <CheckIcon className="size-3.5 shrink-0" />
            ) : (
              <XCircleIcon className="size-3.5 shrink-0" />
            )}
            <span>
              <span className="underline underline-offset-4">{agentName}：{taskText || "查看子对话"}</span>
            </span>
          </span>
        </Button>
      </div>
    );
  }

  return (
    <AgentDelegationCardRoot statusType={statusType}>
      <AgentDelegationCardTrigger
        agentName={agentName}
        taskText={taskText}
        status={displayStatus}
      />
      <AgentDelegationCardPreview result={result} status={displayStatus} />
      <AgentDelegationCardContent
        prompt={prompt}
        result={result}
        status={displayStatus}
        onRetry={hasRetry ? handleRetry : undefined}
      />
    </AgentDelegationCardRoot>
  );
};

export const AgentDelegationCard = memo(
  AgentDelegationCardImpl,
) as ToolCallMessagePartComponent;

AgentDelegationCard.displayName = "AgentDelegationCard";
