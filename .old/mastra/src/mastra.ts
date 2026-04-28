import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { Processor, ProcessorMessageType } from '@mastra/core/processors';
import { RequestContext } from '@mastra/core/request-context';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { fastembed } from '@mastra/fastembed';
import { ModelRouterEmbeddingModel, EMBEDDING_MODELS } from '@mastra/core/llm';
import { eq } from 'drizzle-orm';
import { getDb, getSetting } from './db/db.js';
import { agents as agentsTable, providers as providersTable } from './db/schema.js';
import { getToolsForAgent, ALL_TOOLS } from './tools/novel-tools.js';
import type { OpenAICompatibleConfig } from '@mastra/core/llm';

function getDbUrl(): string {
  const base = process.env.APP_DATA_DIR ?? `${process.cwd()}/data`;
  return `file:${base}/novel-studio.db`;
}

const WORKING_MEMORY_TEMPLATE = `## 创作状态
focus: idle
last_action: none
next_step: none

## 活跃约束
（写作时必须遵守的设定、伏笔、时间线约束）

## 模块摘要
world: 未开始
characters: 未开始
outline: 未开始
chapters: 未开始`;

let _storage: LibSQLStore | null = null;
let _vector: LibSQLVector | null = null;
let _memory: Memory | null = null;

function getStorage(): LibSQLStore {
  if (!_storage) _storage = new LibSQLStore({ id: 'novel-studio-store', url: getDbUrl() });
  return _storage;
}

function getVector(): LibSQLVector {
  if (!_vector) _vector = new LibSQLVector({ id: 'novel-studio-vector', url: getDbUrl() });
  return _vector;
}

export function getMemory(): Memory {
  if (!_memory) {
    _memory = new Memory({
      storage: getStorage(),
      vector: getVector(),
      embedder: fastembed,
      options: {
        lastMessages: 30,
        semanticRecall: {
          topK: 5,
          messageRange: 2,
          scope: 'resource',
        },
        workingMemory: {
          enabled: true,
          template: WORKING_MEMORY_TEMPLATE,
        },
      },
    });
  }
  return _memory;
}

export async function initMemory(): Promise<void> {
  const embedderModel = await getSetting('memory.embedder_model');
  let embedder: typeof fastembed | ModelRouterEmbeddingModel = fastembed;

  if (embedderModel) {
    const slashIdx = embedderModel.indexOf('/');
    const providerName = slashIdx > -1 ? embedderModel.slice(0, slashIdx) : '';
    const modelId = slashIdx > -1 ? embedderModel.slice(slashIdx + 1) : embedderModel;

    const isKnown = EMBEDDING_MODELS.some(
      (m) => `${m.provider}/${m.id}` === embedderModel,
    );

    if (isKnown) {
      embedder = new ModelRouterEmbeddingModel(embedderModel);
    } else if (providerName) {
      const db = getDb();
      const [provider] = await db
        .select()
        .from(providersTable)
        .where(eq(providersTable.name, providerName))
        .limit(1);
      if (provider) {
        embedder = new ModelRouterEmbeddingModel({
          id: `openai/${modelId}` as `${string}/${string}`,
          url: provider.baseUrl || undefined,
          apiKey: provider.apiKey || undefined,
        });
      }
    }
  }

  const omModelSetting = await getSetting('memory.om_model');
  const KNOWN_LLM_PROVIDERS = ['openai', 'google', 'anthropic', 'mistral', 'cohere', 'groq', 'togetherai', 'fireworks'];
  let omModel: string | OpenAICompatibleConfig = omModelSetting ?? 'google/gemini-2.5-flash';

  if (omModelSetting) {
    const slashIdx = omModelSetting.indexOf('/');
    const omProviderName = slashIdx > -1 ? omModelSetting.slice(0, slashIdx) : '';
    const omModelId = slashIdx > -1 ? omModelSetting.slice(slashIdx + 1) : omModelSetting;
    if (omProviderName && !KNOWN_LLM_PROVIDERS.includes(omProviderName)) {
      const db = getDb();
      const [provider] = await db
        .select()
        .from(providersTable)
        .where(eq(providersTable.name, omProviderName))
        .limit(1);
      if (provider) {
        omModel = {
          id: `openai/${omModelId}` as `${string}/${string}`,
          url: provider.baseUrl || undefined,
          apiKey: provider.apiKey || undefined,
        };
      }
    }
  }

  _memory = new Memory({
    storage: getStorage(),
    vector: getVector(),
    embedder,
    options: {
      lastMessages: 30,
      semanticRecall: {
        topK: 5,
        messageRange: 2,
        scope: 'resource',
      },
      workingMemory: {
        enabled: true,
        template: WORKING_MEMORY_TEMPLATE,
      },
      observationalMemory: {
        model: omModel,
        scope: 'resource',
        observation: { messageTokens: 30_000 },
        reflection: { observationTokens: 40_000 },
      },
    },
  });
  _mastra = null;
}

async function resolveModelConfig(
  requestContext?: RequestContext,
): Promise<OpenAICompatibleConfig> {
  const db = getDb();

  const agentId = requestContext?.get('agentId') as string | undefined;
  let agentModel = '';

  if (agentId) {
    const [dbAgent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1);
    if (dbAgent) {
      agentModel = dbAgent.model;
    }
  }

  const overrideModel = requestContext?.get('model') as string | undefined;
  const modelValue = (overrideModel ?? agentModel).trim();

  if (!modelValue) {
    throw new Error('No model selected');
  }

  const slashIdx = modelValue.indexOf('/');
  const providerName = slashIdx > -1 ? modelValue.slice(0, slashIdx) : modelValue;
  const bareModelId = slashIdx > -1 ? modelValue.slice(slashIdx + 1) : modelValue;

  const [byName] = await db
    .select()
    .from(providersTable)
    .where(eq(providersTable.name, providerName))
    .limit(1);

  const [fallback] =
    byName?.enabled
      ? []
      : await db.select().from(providersTable).where(eq(providersTable.enabled, 1)).limit(1);

  const provider = byName?.enabled ? byName : fallback;

  if (!provider) {
    throw new Error('No enabled LLM provider found. Please configure one in Settings → LLM.');
  }

  const normalizedId: `${string}/${string}` = `openai/${bareModelId}`;

  return {
    id: normalizedId,
    url: provider.baseUrl || undefined,
    apiKey: provider.apiKey || undefined,
  };
}

async function resolveInstructions(
  requestContext?: RequestContext,
  fallbackPrompt?: string,
): Promise<string> {
  const agentId = requestContext?.get('agentId') as string | undefined;
  if (!agentId) return fallbackPrompt ?? 'You are a helpful assistant.';

  const db = getDb();
  const [dbAgent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1);
  const systemPrompt = dbAgent?.systemPrompt || fallbackPrompt || 'You are a helpful assistant.';

  const context = requestContext?.get('context') as Record<string, unknown> | undefined;
  const hasBookId = !!(
    context?.bookId ??
    context?.projectId ??
    requestContext?.get('bookId') ??
    requestContext?.get('projectId')
  );

  let prompt = systemPrompt;
  if (context) {
    prompt = `${prompt}\n\n当前页面上下文：${JSON.stringify(context)}`;
  }

  if (agentId === 'preset-director' && !hasBookId) {
    prompt = `${prompt}\n\n【强制规则｜新书两阶段流程（创建前阶段）】当前尚未创建书籍（无 bookId/projectId）。你必须先与用户收集并确认 3 项基础信息：1) 书名 title，2) 类型 genre，3) 核心 premise（1-2 句核心冲突/故事前提）。若任一项缺失或不明确，继续追问澄清，禁止调用任何工具。仅当三项都明确并得到用户确认后，才允许调用 createProject，且只调用一次。\n\n【工具/委派限制】在创建前阶段，绝对禁止调用除 createProject 以外的任何工具；绝对禁止调用任何子智能体（agent-*）。\n\n【创建后立即停止】createProject 成功后，立即用一句简短确认告知“书籍已创建，正在进入工作台继续”，然后停止当前轮次，不再调用任何工具、不再委派子智能体；后续工作将在工作台上下文中继续。`;
  }

  if (agentId === 'preset-director') {
    prompt = `${prompt}\n\n【子智能体调用规则】调用子智能体工具（如 agent-preset-worldbuilder 等）时，禁止传入 maxSteps、suspendedToolRunId、resumeData 等框架参数。只需传入 prompt、threadId、resourceId、instructions 字段即可。`;
  }

  return prompt;
}

const PRESET_AGENT_IDS = [
  'preset-director',
  'preset-worldbuilder',
  'preset-character-designer',
  'preset-outline-planner',
  'preset-chapter-planner',
  'preset-writer',
  'preset-dialogue',
  'preset-polisher',
  'preset-reviewer',
  'preset-reader-feedback',
] as const;

type PresetAgentId = (typeof PRESET_AGENT_IDS)[number];

const PRESET_AGENT_DESCRIPTIONS: Record<PresetAgentId, string> = {
  'preset-director': '全局统筹：分析创作目标，拆解任务，向各专项智能体分配工作并整合输出',
  'preset-worldbuilder': '设计故事世界的背景、规则、历史、地理和社会体系',
  'preset-character-designer': '创建角色档案、性格弧线、人物关系网络和成长轨迹',
  'preset-outline-planner': '设计故事整体结构、情节节点、主线与支线，确保戏剧张力持续',
  'preset-chapter-planner': '将大纲节点细化为单章场景分解、节奏设计和悬念钩子',
  'preset-writer': '根据章节规划执行正文创作，保持风格统一和人物一致性',
  'preset-dialogue': '专项创作高质量对话场景，赋予每个角色独特的说话方式和潜台词',
  'preset-polisher': '语言层面的精修：节奏、词汇、句式优化，不改变情节和人物',
  'preset-reviewer': '逻辑、一致性和结构审查：找出漏洞、矛盾和节奏问题并给出修改方案',
  'preset-reader-feedback': '模拟目标读者反馈：吸引力、情感共鸣、节奏感和"想继续读"的动力',
};

const DIRECTOR_SUB_AGENT_IDS = [
  'preset-worldbuilder',
  'preset-character-designer',
  'preset-outline-planner',
  'preset-writer',
  'preset-reviewer',
] as const;

const DELEGATED_TOOL_ARG_KEYS = new Set([
  'maxSteps',
  'suspendedToolRunId',
  'resumeData',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeDelegatedToolArgs(toolName: string, args: unknown): unknown {
  if (!toolName.startsWith('agent-preset-') || !isRecord(args)) {
    return args;
  }

  let changed = false;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (DELEGATED_TOOL_ARG_KEYS.has(key)) {
      changed = true;
      continue;
    }
    sanitized[key] = value;
  }

  return changed ? sanitized : args;
}

function sanitizeDelegatedToolMessages(messages: ProcessorMessageType[]): ProcessorMessageType[] {
  let changed = false;

  const nextMessages = messages.map((message) => {
    const nextParts = message.content.parts.map((part) => {
      if (part.type !== 'tool-invocation') return part;

      const nextArgs = sanitizeDelegatedToolArgs(part.toolInvocation.toolName, part.toolInvocation.args);
      if (nextArgs === part.toolInvocation.args) return part;

      changed = true;
      return {
        ...part,
        toolInvocation: {
          ...part.toolInvocation,
          args: nextArgs,
        },
      };
    });

    if (nextParts === message.content.parts) {
      return message;
    }

    return {
      ...message,
      content: {
        ...message.content,
        parts: nextParts,
      },
    };
  });

  return changed ? nextMessages : messages;
}

const delegatedToolArgSanitizer: Processor<'delegated-tool-arg-sanitizer'> = {
  id: 'delegated-tool-arg-sanitizer',
  processOutputStep(args) {
    let changed = false;

    for (const toolCall of args.toolCalls ?? []) {
      const nextArgs = sanitizeDelegatedToolArgs(toolCall.toolName, toolCall.args);
      if (nextArgs === toolCall.args) continue;
      toolCall.args = nextArgs;
      changed = true;
    }

    const nextMessages = sanitizeDelegatedToolMessages(args.messages);
    if (nextMessages !== args.messages) {
      changed = true;
    }

    return changed ? nextMessages : undefined;
  },
};

function buildPresetAgent(id: PresetAgentId, memory: Memory): Agent {
  return new Agent({
    id,
    name: id,
    description: PRESET_AGENT_DESCRIPTIONS[id],
    instructions: async ({ requestContext }) => resolveInstructions(requestContext, undefined),
    model: async ({ requestContext }) => resolveModelConfig(requestContext),
    tools: getToolsForAgent(id),
    memory,
  });
}

export function buildDynamicAgent(config: {
  id: string;
  name: string;
  systemPrompt: string;
  model: string;
  provider: string;
}, memory: Memory): Agent {
  return new Agent({
    id: config.id,
    name: config.name,
    instructions: async ({ requestContext }) => {
      const context = requestContext?.get('context') as Record<string, unknown> | undefined;
      if (context) {
        return `${config.systemPrompt}\n\n当前页面上下文：${JSON.stringify(context)}`;
      }
      return config.systemPrompt;
    },
    model: async ({ requestContext }) => resolveModelConfig(requestContext),
    tools: { ...ALL_TOOLS },
    memory,
  });
}

type AppAgents = Record<PresetAgentId, Agent>;

let _mastra: Mastra<AppAgents> | null = null;

export function getMastra(): Mastra<AppAgents> {
  if (_mastra) return _mastra;

  const memory = getMemory();

  const subAgents = {} as Record<(typeof DIRECTOR_SUB_AGENT_IDS)[number], Agent>;
  for (const id of DIRECTOR_SUB_AGENT_IDS) {
    subAgents[id] = buildPresetAgent(id, memory);
  }

  const director = new Agent({
    id: 'preset-director',
    name: 'preset-director',
    description: PRESET_AGENT_DESCRIPTIONS['preset-director'],
    instructions: async ({ requestContext }) => resolveInstructions(requestContext, undefined),
    model: async ({ requestContext }) => resolveModelConfig(requestContext),
    tools: getToolsForAgent('preset-director'),
    memory,
    outputProcessors: [delegatedToolArgSanitizer],
    agents: {
      'preset-worldbuilder': subAgents['preset-worldbuilder'],
      'preset-character-designer': subAgents['preset-character-designer'],
      'preset-outline-planner': subAgents['preset-outline-planner'],
      'preset-writer': subAgents['preset-writer'],
      'preset-reviewer': subAgents['preset-reviewer'],
    },
  });

  const agents: AppAgents = {
    'preset-director': director,
    'preset-worldbuilder': subAgents['preset-worldbuilder'],
    'preset-character-designer': subAgents['preset-character-designer'],
    'preset-outline-planner': subAgents['preset-outline-planner'],
    'preset-chapter-planner': buildPresetAgent('preset-chapter-planner', memory),
    'preset-writer': subAgents['preset-writer'],
    'preset-dialogue': buildPresetAgent('preset-dialogue', memory),
    'preset-polisher': buildPresetAgent('preset-polisher', memory),
    'preset-reviewer': subAgents['preset-reviewer'],
    'preset-reader-feedback': buildPresetAgent('preset-reader-feedback', memory),
  };

  _mastra = new Mastra<AppAgents>({ agents, storage: getStorage() });
  return _mastra;
}
