import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk';
import { isToolUIPart, getToolName, type UIMessage } from 'ai';
import { useAIChat, type Conversation } from '../../../contexts/AIChatContext';
import { SparkIcon, PlusIcon, TrashIcon, EditIcon } from '../shared/Icons';
import { Button } from '../../ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../ui/select';
import { ModelPickerCompact } from './ModelPicker';
import { Thread } from '@/components/assistant-ui/thread';
import { cn } from '../../../lib/utils';
import type { AgentConfig, Provider } from '../../../types';
import {
  getChatApiUrl,
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  listAgentConfigs,
  listAvailableAgents,
  listProviders,
  initializeProjectWorld,
} from '../../../api';

const ERROR_MESSAGES: Record<string, string> = {
  'No provider configured': '未配置 AI 服务商，请前往设置添加',
  'not configured or disabled': '服务商未配置或已禁用，请检查服务商配置',
  'API key': 'API Key 无效，请检查服务商配置',
  'api key': 'API Key 无效，请检查服务商配置',
  'No enabled provider': '没有可用的服务商，请在服务商配置中启用',
  'Failed to fetch': '无法连接到 AI 服务，请检查网络或服务是否启动',
  'fetch failed': '无法连接到 AI 服务，请检查网络或服务是否启动',
  timeout: '请求超时，请稍后重试',
  'rate limit': '请求频率超限，请稍后重试',
  'Rate limit': '请求频率超限，请稍后重试',
  insufficient_quota: '账户额度不足，请检查服务商账户',
  'context length': '输入内容过长，请缩短对话历史',
  'model not found': '模型不存在，请检查智能体配置',
  'Model not found': '模型不存在，请检查智能体配置',
};

const TOOL_LABELS: Record<string, string> = {
  createProject: '创建书籍',
  createWorldSetting: '创建世界设定',
  updateWorldSetting: '更新世界设定',
  listWorldSettings: '查询世界设定',
  createChapter: '创建章节',
  updateChapter: '更新章节',
  listChapters: '查询章节',
};

function localizeError(msg: string | undefined): string {
  if (!msg) return '生成失败，请重试';
  for (const [key, zh] of Object.entries(ERROR_MESSAGES)) {
    if (msg.includes(key)) return zh;
  }
  return `生成失败：${msg}`;
}

const DEFAULT_STARTERS = [
  '帮我构思一部玄幻小说的世界观',
  '帮我续写下一章内容',
  '分析我的角色设定，给出改进建议',
  '帮我设计反派角色',
];

const PAGE_STARTERS: Record<string, string[]> = {
  world: [
    '扩展当前「{type}」设定的细节',
    '分析当前「{type}」设定的内在逻辑是否自洽',
    '帮我补全「{type}」分类下的核心条目',
    '生成与当前设定相关的新世界条目',
  ],
  writing: [
    '帮我续写这一章的下一段',
    '润色当前段落，使文笔更流畅',
    '为当前场景增加细节描写',
    '检查文中人物对话是否自然',
  ],
  outline: [
    '帮我完善当前章节的提纲',
    '分析提纲结构，指出可改进之处',
    '根据现有提纲推测后续剧情走向',
    '帮我设计一个反转情节',
  ],
  characters: [
    '深化当前角色的人物弧光',
    '分析主角与配角的关系',
    '帮我设计角色的成长经历',
    '生成角色间的对话样本',
  ],
  review: [
    '审阅当前章节的节奏与张力',
    '找出文中前后矛盾的情节',
    '对当前内容给出修改建议',
    '评价人物塑造是否立体',
  ],
  books: [
    '帮我构思一部玄幻小说，创建书籍',
    '我想写一部都市爱情小说，帮我起个书名和大纲',
    '帮我设计一个科幻世界观，然后创建项目',
    '我有个故事想法，帮我规划后创建书籍',
  ],
};

function getStarters(pageKey?: string, meta?: Record<string, unknown>): string[] {
  if (!pageKey) return DEFAULT_STARTERS;
  const prompts = PAGE_STARTERS[pageKey];
  if (!prompts) return DEFAULT_STARTERS;
  const typeName = typeof meta?.typeName === 'string' ? meta.typeName : '';
  return prompts.map((p) => (typeName ? p.replace('{type}', typeName) : p.replace('「{type}」', '')));
}

function parseModels(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function pickRecommendedAgent(agents: AgentConfig[], hint: string): AgentConfig | undefined {
  const lower = hint.toLowerCase();
  return agents.find((a) => a.name.toLowerCase().includes(lower));
}

function buildUIMessage(m: {
  id: string;
  role: string;
  content: { parts?: Array<{ text?: string }>; content?: string } | string;
}): UIMessage {
  let text = '';
  if (typeof m.content === 'string') {
    text = m.content;
  } else if (m.content?.parts) {
    text = m.content.parts.map((p) => p.text ?? '').join('');
  } else if (m.content?.content) {
    text = m.content.content;
  }
  return {
    id: m.id,
    role: m.role as 'user' | 'assistant',
    parts: [{ type: 'text', text }],
  };
}

function buildSeedMessage(m: {
  id: string;
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
}): UIMessage {
  const text = m.content
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n\n');

  return {
    id: m.id,
    role: m.role,
    parts: [{ type: 'text', text }],
  };
}

export function ConversationsSidebar({
  agentId,
  projectId,
  activeId,
  onSelect,
  onNew,
  refreshKey,
}: {
  agentId: string;
  projectId?: string | null;
  activeId: string | null;
  onSelect: (conv: Conversation) => void;
  onNew: () => void;
  refreshKey: number;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await listConversations(
        projectId ? { projectId } : { agentId: agentId },
      );
      setConversations(data.conversations ?? []);
    } catch {
      void 0;
    }
  }, [agentId, projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) onNew();
    } catch {
      void 0;
    }
    setDeletingId(null);
  }

  function startRename(conv: Conversation, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameValue(conv.title || '新对话');
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      await updateConversation(id, { title: trimmed });
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
    } catch {
      void 0;
    }
    setRenamingId(null);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-[10px] text-muted-foreground tracking-wide uppercase">对话历史</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onNew}
          className="p-0.5 h-auto w-auto text-muted-foreground hover:text-primary hover:bg-transparent"
          title="新建对话"
        >
          <PlusIcon />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <p className="text-[10px] text-muted-foreground px-3 py-3 text-center">暂无对话历史</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={[
                'group flex items-center gap-1 px-3 py-2 cursor-pointer transition-colors',
                conv.id === activeId
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ].join(' ')}
              onClick={() => onSelect(conv)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(conv)}
            >
              {renamingId === conv.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => void commitRename(conv.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') void commitRename(conv.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-xs bg-muted border border-primary/25 rounded-sm px-1 py-0.5 text-foreground focus:outline-none min-w-0"
                />
              ) : (
                <span className="flex-1 text-xs truncate min-w-0">{conv.title || '新对话'}</span>
              )}

              {renamingId !== conv.id &&
                (deletingId === conv.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => void handleDelete(conv.id, e)}
                      className="text-[10px] text-destructive border-0 bg-transparent cursor-pointer hover:underline"
                    >
                      确认
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(null);
                      }}
                      className="text-[10px] text-muted-foreground border-0 bg-transparent cursor-pointer hover:underline"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => startRename(conv, e)}
                      className="p-0.5 h-auto w-auto text-muted-foreground hover:text-primary hover:bg-transparent"
                      title="重命名"
                    >
                      <EditIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(conv.id);
                      }}
                      className="p-0.5 h-auto w-auto text-muted-foreground hover:text-destructive hover:bg-transparent"
                      title="删除对话"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RuntimeThread({
  runtimeKey,
  initialMessages,
  transportRef,
  ensureThreadIdRef,
  starters,
  composerExtra,
  pendingMessage,
  clearPendingMessage,
  onProjectCreated,
  onBookCreated,
  setCurrentThreadId,
  setConvRefreshKey,
  setRuntimeError,
  preferredThreadId,
  pendingMessageRequiresExistingThread,
}: {
  runtimeKey: string;
  initialMessages: UIMessage[];
  transportRef: React.MutableRefObject<{
    agentId: string;
    threadId: string | null;
    context: Record<string, unknown> | undefined;
    model: string | undefined;
    autoMode: boolean;
    requiresModelSelection: boolean;
  }>;
  ensureThreadIdRef: React.MutableRefObject<((firstMessageText?: string) => Promise<string | null>) | null>;
  starters: string[];
  composerExtra: React.ReactNode;
  pendingMessage: string | null;
  clearPendingMessage: () => void;
  onProjectCreated: (() => void) | null;
  onBookCreated: ((bookId: string, conversationId?: string | null) => void) | null;
  setCurrentThreadId: (id: string | null) => void;
  setConvRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  setRuntimeError: (msg: string | null) => void;
  preferredThreadId: string | null;
  pendingMessageRequiresExistingThread: boolean;
}) {
  const creatingThreadRef = useRef<Promise<string | null> | null>(null);
  const lastHandledBookIdRef = useRef<string | null>(null);
  const onBookCreatedRef = useRef(onBookCreated);
  onBookCreatedRef.current = onBookCreated;
  const onProjectCreatedRef = useRef(onProjectCreated);
  onProjectCreatedRef.current = onProjectCreated;

  const ensureThreadId = useCallback(
    async (firstMessageText?: string): Promise<string | null> => {
      if (transportRef.current.threadId) return transportRef.current.threadId;
      if (creatingThreadRef.current) return creatingThreadRef.current;

      const promise = (async () => {
        try {
          const ctx = transportRef.current.context;
          const projectId = (ctx?.bookId ?? ctx?.projectId) as string | undefined;
          const title = firstMessageText?.slice(0, 30) ?? '新对话';
          const conv = await createConversation({
            agentId: transportRef.current.agentId || 'preset-director',
            title,
            ...(projectId ? { projectId } : {}),
          });
          transportRef.current.threadId = conv.id;
          setCurrentThreadId(conv.id);
          setConvRefreshKey((k) => k + 1);
          return conv.id;
        } catch {
          void 0;
        }
        return null;
      })();

      creatingThreadRef.current = promise;
      const result = await promise;
      creatingThreadRef.current = null;
      return result;
    },
    [transportRef, setCurrentThreadId, setConvRefreshKey],
  );

  useEffect(() => {
    ensureThreadIdRef.current = ensureThreadId;
  }, [ensureThreadIdRef, ensureThreadId]);

  const transport = useMemo(
    () =>
      new AssistantChatTransport<UIMessage>({
        api: getChatApiUrl(),
        prepareSendMessagesRequest: async ({ messages }) => {
          const extra = transportRef.current;
          const agentId = extra.agentId;
          if (extra.requiresModelSelection && !extra.model) {
            throw new Error('No model selected');
          }
          if (!extra.threadId) {
            const firstUserText = messages.find((m) => m.role === 'user')?.parts
              .map((p) => ('text' in p ? p.text : ''))
              .join('') ?? '';
            await ensureThreadIdRef.current?.(firstUserText);
          }
          return {
              body: {
                messages,
                memory: extra.threadId
                  ? { thread: extra.threadId, resource: agentId }
                  : undefined,
                data: extra.context,
                model: extra.model,
                autoMode: extra.autoMode,
              },
            api: getChatApiUrl(agentId),
          };
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transportRef],
  );

  const runtime = useChatRuntime<UIMessage>({
    transport,
    messages: initialMessages,
    onFinish: ({ messages }) => {
      if (onProjectCreatedRef.current) onProjectCreatedRef.current();
      if (onBookCreatedRef.current) {
        outer: for (const msg of messages) {
          for (const part of msg.parts) {
            if (
              isToolUIPart(part) &&
              getToolName(part) === 'createProject' &&
              part.state === 'output-available'
            ) {
              const bookId = (part.output as { id?: string } | null | undefined)?.id;
              if (bookId && bookId !== lastHandledBookIdRef.current) {
                  lastHandledBookIdRef.current = bookId;
                  void (async () => {
                    let convId: string | null = null;
                    try {
                       const existingThreadId = transportRef.current.threadId;
                      if (existingThreadId) {
                        await updateConversation(existingThreadId, { projectId: bookId });
                        convId = existingThreadId;
                      } else {
                        const conv = await createConversation({
                          agentId: transportRef.current.agentId || 'preset-director',
                          projectId: bookId,
                          title: '创建书籍',
                        });
                        convId = conv.id;
                      }
                      void initializeProjectWorld(bookId).catch(() => void 0);
                    } catch {
                      void 0;
                    }
                    onBookCreatedRef.current?.(bookId, convId);
                  })();
              }
              break outer;
            }
          }
        }
      }
    },
    onError: (err) => {
      setRuntimeError(err.message);
      console.error('[AIChatPanel] chat error:', err);
    },
  });

  useEffect(() => {
    if (!pendingMessage) return;
    const state = runtime.thread.getState();
    if (state.isRunning) return;
    if (pendingMessageRequiresExistingThread && preferredThreadId && !transportRef.current.threadId) return;

    void (async () => {
      const content = pendingMessage.trim();
      if (!content) {
        clearPendingMessage();
        return;
      }

      if (!pendingMessageRequiresExistingThread || !preferredThreadId) {
        await ensureThreadIdRef.current?.(content);
      }
      if (pendingMessageRequiresExistingThread && preferredThreadId && !transportRef.current.threadId) return;
      clearPendingMessage();
      runtime.thread.composer.setText(content);
      runtime.thread.composer.send();
    })();
  }, [
    runtime,
    pendingMessage,
    clearPendingMessage,
    transportRef,
    ensureThreadIdRef,
    preferredThreadId,
    pendingMessageRequiresExistingThread,
  ]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Thread suggestions={starters} composerExtra={composerExtra} />
      </div>
    </AssistantRuntimeProvider>
  );
}

export function AIChatPanel({ withConversations = false, initialAgentId, initialConversationId = null, hideConversationsSidebar = false, pendingMessageRequiresExistingThread = false, seedMessages }: { withConversations?: boolean; initialAgentId?: string; initialConversationId?: string | null; hideConversationsSidebar?: boolean; pendingMessageRequiresExistingThread?: boolean; seedMessages?: ReadonlyArray<{ id: string; role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> }> } = {}) {
  const {
    pendingMessage,
    clearPendingMessage,
    pageContext,
    activeConversationId,
    setActiveConversationId,
    activeBookId,
    onProjectCreated,
    onBookCreated,
    setTriggerNewConversation,
    bumpConvListRefreshKey,
  } = useAIChat();

  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [userPickedAgent, setUserPickedAgent] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [convRefreshKey, setConvRefreshKey] = useState(0);
  const [loadedMessages, setLoadedMessages] = useState<UIMessage[]>([]);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(true);

  const normalizeConversationAgentId = useCallback((conversationAgentId: string | undefined): string | null => {
    if (!conversationAgentId) return null;
    if (agentConfigs.some((agent) => agent.id === conversationAgentId)) {
      return conversationAgentId;
    }

    const presetMatch = conversationAgentId.match(/(preset-[a-z0-9-]+)$/i)?.[1] ?? null;
    if (presetMatch && agentConfigs.some((agent) => agent.id === presetMatch)) {
      return presetMatch;
    }

    return null;
  }, [agentConfigs]);

  const applyConversationAgent = useCallback((conversationAgentId: string | undefined) => {
    const normalizedAgentId = normalizeConversationAgentId(conversationAgentId);
    if (!normalizedAgentId) return;
    if (normalizedAgentId === selectedAgentId) return;
    const matchedAgent = agentConfigs.find((agent) => agent.id === normalizedAgentId);
    setSelectedAgentId(normalizedAgentId);
    setSelectedModel(matchedAgent?.model ?? '');
  }, [agentConfigs, normalizeConversationAgentId, selectedAgentId]);

  const allModelOptions = providers
    .map((p) => ({ providerName: p.name, models: parseModels(p.models) }))
    .filter((p) => p.models.length > 0);
  const hasModels = allModelOptions.length > 0;
  const selectedAgent = agentConfigs.find((agent) => agent.id === selectedAgentId);
  const agentHasConfiguredModel = !!selectedAgent?.model?.trim();
  const requiresModelSelection = !!selectedAgentId && !agentHasConfiguredModel;

  const buildContext = (meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (activeBookId) {
      return { bookId: activeBookId, ...meta };
    }
    return meta;
  };

  const ensureThreadIdRef = useRef<((firstMessageText?: string) => Promise<string | null>) | null>(null);

  const transportRef = useRef({
    agentId: selectedAgentId || 'preset-director',
    threadId: currentThreadId,
    context: buildContext(pageContext?.meta as Record<string, unknown> | undefined),
    model: selectedModel || (undefined as string | undefined),
    autoMode: true as boolean,
    requiresModelSelection: false,
  });

  transportRef.current = {
    agentId: selectedAgentId || 'preset-director',
    threadId: currentThreadId,
    context: buildContext(pageContext?.meta as Record<string, unknown> | undefined),
    model: selectedModel || undefined,
    autoMode,
    requiresModelSelection,
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [configData, availData, provData] = await Promise.all([
          listAgentConfigs(),
          listAvailableAgents(),
          listProviders(),
        ]);

        const provList = provData.providers ?? [];
        const configs = configData.agents ?? [];
        const availIds = availData.agents ?? [];
        setAgentConfigs(configs);
        setProviders(provList);
        setAgentAvailable(availIds.length > 0 || configs.length > 0);

        if (configs.length > 0) {
          const preferred = initialAgentId ? configs.find((a) => a.id === initialAgentId) : undefined;
          const firstAvail = preferred ?? configs.find((a) => availIds.includes(a.id)) ?? configs[0];
          setSelectedAgentId(firstAvail.id);
          setSelectedModel(firstAvail.model ?? '');
        }
      } catch {
        setAgentAvailable(false);
      }
    }
    void loadData();
  }, [initialAgentId]);

  useEffect(() => {
    if (!pageContext?.recommendedAgentHint || userPickedAgent || agentConfigs.length === 0) return;
    const match = pickRecommendedAgent(agentConfigs, pageContext.recommendedAgentHint);
    if (match && match.id !== selectedAgentId) {
      setSelectedAgentId(match.id);
      setSelectedModel(match.model ?? '');
      setLoadedMessages([]);
      setRuntimeKey((k) => k + 1);
    }
  }, [agentConfigs, pageContext?.recommendedAgentHint, providers, selectedAgentId, userPickedAgent]);

  const lastExternalConvRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialConversationId) return;
    if (activeConversationId === initialConversationId) return;
    setActiveConversationId(initialConversationId);
  }, [activeConversationId, initialConversationId, setActiveConversationId]);

  useEffect(() => {
    if (activeConversationId === null) {
      if (lastExternalConvRef.current !== null) {
        lastExternalConvRef.current = null;
        setLoadedMessages([]);
        setCurrentThreadId(null);
        setRuntimeError(null);
        setActiveConversationId(null);
        setConvRefreshKey((k) => k + 1);
        setRuntimeKey((k) => k + 1);
      }
      return;
    }

    if (activeConversationId === currentThreadId) return;
    if (activeConversationId === lastExternalConvRef.current) return;
    lastExternalConvRef.current = activeConversationId;

    void (async () => {
      try {
        const data = await getConversation(
          activeConversationId,
          selectedAgentId || 'preset-director',
        );
        applyConversationAgent(data.resourceId);
        const loaded = (data.messages ?? [])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map(buildUIMessage);
        setLoadedMessages(loaded);
        setCurrentThreadId(activeConversationId);
        setRuntimeError(null);
        setRuntimeKey((k) => k + 1);
      } catch {
        void 0;
      }
    })();
  }, [activeConversationId, applyConversationAgent, currentThreadId, selectedAgentId, setActiveConversationId]);

  useEffect(() => {
    if (activeConversationId) return;
    if (!seedMessages || seedMessages.length === 0) return;
    lastExternalConvRef.current = null;
    setLoadedMessages(seedMessages.map(buildSeedMessage));
    setCurrentThreadId(null);
    setRuntimeError(null);
    setRuntimeKey((k) => k + 1);
  }, [activeConversationId, seedMessages]);

  const handleNewConversation = useCallback(() => {
    setLoadedMessages([]);
    setCurrentThreadId(null);
    setRuntimeError(null);
    setActiveConversationId(null);
    setConvRefreshKey((k) => k + 1);
    setRuntimeKey((k) => k + 1);
  }, [setActiveConversationId]);

  useEffect(() => {
    setTriggerNewConversation(handleNewConversation);
    return () => {
      setTriggerNewConversation(null);
    };
  }, [handleNewConversation, setTriggerNewConversation]);

  useEffect(() => {
    if (convRefreshKey === 0) return;
    bumpConvListRefreshKey();
  }, [convRefreshKey, bumpConvListRefreshKey]);

  function handleAgentChange(id: string) {
    const agent = agentConfigs.find((a) => a.id === id);
    setSelectedAgentId(id);
    if (agent) {
      setSelectedModel(agent.model ?? '');
    }
    setRuntimeError(null);
    setUserPickedAgent(true);
  }

  useEffect(() => {
    if (!selectedModel) return;
    setRuntimeError((prev) => (prev === 'No model selected' ? null : prev));
  }, [selectedModel]);

  const starters = getStarters(pageContext?.pageKey, pageContext?.meta);

  const composerExtra = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {agentConfigs.length > 0 && (
        <Select
          value={selectedAgentId}
          onValueChange={(val) => handleAgentChange(val)}
          disabled={!!pageContext?.agentLocked}
        >
          <SelectTrigger
            className={cn(
              'text-xs h-6 px-2 max-w-[120px]',
              pageContext?.agentLocked ? 'opacity-60 cursor-not-allowed' : '',
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agentConfigs.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {hasModels && (
        <ModelPickerCompact
          providers={providers}
          value={selectedModel}
          onChange={(val) => setSelectedModel(val)}
          placeholder={requiresModelSelection ? '请选择模型 *' : '模型'}
          className={cn(
            requiresModelSelection && !selectedModel && 'border-destructive text-destructive',
          )}
        />
      )}
      {requiresModelSelection && !selectedModel && hasModels && (
        <span className="text-[10px] text-destructive">当前智能体未配置默认模型，请手动选择</span>
      )}
      <button
        type="button"
        onClick={() => setAutoMode((v) => !v)}
        className={cn(
          'text-[10px] h-6 px-2 rounded border transition-colors leading-none flex-shrink-0',
          autoMode
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
        )}
        title={autoMode ? '自动模式：Director 连续执行委派' : '手动模式：每轮委派后等待确认'}
      >
        {autoMode ? '自动' : '手动'}
      </button>
    </div>
  );

  return (
    <div className="flex h-full bg-background w-full">
      {withConversations && !hideConversationsSidebar && (
        <div className="w-40 border-r border-border flex-shrink-0">
          <ConversationsSidebar
            agentId={selectedAgentId || 'preset-director'}
            projectId={activeBookId}
            activeId={currentThreadId}
            onSelect={(conv) => setActiveConversationId(conv.id)}
            onNew={handleNewConversation}
            refreshKey={convRefreshKey}
          />
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        {!hideConversationsSidebar && (
          <div className="flex items-center px-4 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-primary flex-shrink-0">
                <SparkIcon />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm text-foreground leading-none">AI 创作助手</h3>
                {pageContext?.label && <p className="text-xs text-muted-foreground mt-0.5 truncate">{pageContext.label}</p>}
              </div>
            </div>
          </div>
        )}

        {!agentAvailable ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-muted-foreground text-sm leading-relaxed">AI 服务未就绪，请确保 Mastra 服务已启动</p>
              <code className="block mt-3 text-xs text-muted-foreground font-mono bg-muted border border-border rounded-sm px-3 py-2">
                pnpm --filter @novel-local-studio/mastra dev
              </code>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <RuntimeThread
              key={`${runtimeKey}`}
              runtimeKey={`${runtimeKey}:${currentThreadId ?? 'new'}`}
              initialMessages={loadedMessages}
              transportRef={transportRef}
              ensureThreadIdRef={ensureThreadIdRef}
              starters={starters}
              composerExtra={composerExtra}
              pendingMessage={pendingMessage}
              clearPendingMessage={clearPendingMessage}
              onProjectCreated={onProjectCreated}
              onBookCreated={onBookCreated}
              setCurrentThreadId={(id) => {
                setCurrentThreadId(id);
                setActiveConversationId(id);
              }}
              setConvRefreshKey={setConvRefreshKey}
              setRuntimeError={setRuntimeError}
              preferredThreadId={activeConversationId}
              pendingMessageRequiresExistingThread={pendingMessageRequiresExistingThread}
            />

            {runtimeError && (
              <div className="px-3 py-2 border-t border-border">
                <span className="text-destructive text-xs">{localizeError(runtimeError)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

void TOOL_LABELS;
