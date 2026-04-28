import { getLibSqlClient } from '../db/libsql.ts';
import { registry, type Bindings, type ProviderConfig } from './providers.ts';
import { setBindings } from '../agents/bindings-cache.ts';
import { setAgents } from '../agents/agents-cache.ts';

const PROVIDERS_KEY = 'providers';
const BINDINGS_KEY = 'modelBindings';
const AGENTS_KEY = 'agents';
const LINEUPS_KEY = 'lineups';

export type AgentType = 'supervisor' | 'architect' | 'chronicler' | 'editor' | 'loreKeeper';

export const AGENT_TYPES: AgentType[] = [
  'supervisor',
  'architect',
  'chronicler',
  'editor',
  'loreKeeper',
];

export type AgentDef = {
  id: string;
  type: AgentType;
  label: string;
  description?: string;
  systemPrompt: string;
  providerId: string;
  model: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Lineup = {
  id: string;
  label: string;
  description?: string;
  agents: Record<AgentType, string>;
  createdAt: number;
  updatedAt: number;
};

export const BUILTIN_AGENT_IDS: Record<AgentType, string> = {
  supervisor: 'builtin-supervisor',
  architect: 'builtin-architect',
  chronicler: 'builtin-chronicler',
  editor: 'builtin-editor',
  loreKeeper: 'builtin-loreKeeper',
};

export const BUILTIN_AGENT_DEFS: Omit<AgentDef, 'createdAt' | 'updatedAt'>[] = [
  {
    id: BUILTIN_AGENT_IDS.supervisor,
    type: 'supervisor',
    label: '默认总管',
    description: '顶层调度，把任务委派给子智能体并汇总结果。',
    builtin: true,
    providerId: 'openai-default',
    model: 'gpt-4o',
    systemPrompt: [
      '你是小说创作总管（Supervisor）。',
      '你的职责是理解用户意图，把任务拆分并委派给合适的子智能体：',
      '- architect: 结构/大纲/章节规划',
      '- chronicler: 撰写正文叙事',
      '- editor: 润色与风格调整',
      '- loreKeeper: 世界观/人设/时间线一致性检查',
      '可用工具：listBooks/getDocumentTree/readDocument 用于了解书籍内容；',
      'searchDocuments 用于全文检索；createDocument/updateDocument/deleteDocument 用于直接增删改文档。',
      '规则：',
      '1. 用户请求先判断类型，选择 1-2 个最相关子智能体并调用，必要时先用工具检索上下文。',
      '2. 简单问答可直接回答，不必委派。',
      '3. 涉及文档增删改时，优先委派给对应子智能体；如需自己处理则直接调用工具。',
      '4. 汇总结果后用自然语言给用户最终答复，始终使用中文。',
    ].join('\n'),
  },
  {
    id: BUILTIN_AGENT_IDS.architect,
    type: 'architect',
    label: '默认架构师',
    description: '只负责大纲、章节骨架、情节节奏、人物弧线规划。',
    builtin: true,
    providerId: 'openai-default',
    model: 'gpt-4o-mini',
    systemPrompt: [
      '你是小说结构师（Architect）。只负责：大纲、章节骨架、情节节奏、人物弧线规划。',
      '输出简洁结构化结果，不写正文散文。',
      '你可以使用工具读取书籍结构（getDocumentTree/readDocument）、搜索（searchDocuments），',
      '并在合适位置创建/更新 outline 或 folder/chapter 骨架（createDocument/updateDocument）。',
    ].join('\n'),
  },
  {
    id: BUILTIN_AGENT_IDS.chronicler,
    type: 'chronicler',
    label: '默认执笔者',
    description: '依据章节骨架撰写正文叙事。',
    builtin: true,
    providerId: 'openai-default',
    model: 'gpt-4o',
    systemPrompt: [
      '你是小说执笔者（Chronicler）。依据结构师给出的章节骨架，撰写高质量中文叙事正文。',
      '保持风格一致，避免 AI 套话。',
      '使用 readDocument 读取相关章节/设定/大纲获取上下文，使用 searchDocuments 检索相关线索；',
      '通过 updateDocument 把正文写入指定章节文档。',
    ].join('\n'),
  },
  {
    id: BUILTIN_AGENT_IDS.editor,
    type: 'editor',
    label: '默认编辑',
    description: '润色、调整语气、修正连贯性与风格。',
    builtin: true,
    providerId: 'openai-default',
    model: 'gpt-4o-mini',
    systemPrompt: [
      '你是小说编辑（Editor）。润色、调整语气、修正连贯性与风格。保留原意，只改表达。',
      '通过 readDocument 取得目标文档原文，通过 updateDocument 写回修改后的内容。',
    ].join('\n'),
  },
  {
    id: BUILTIN_AGENT_IDS.loreKeeper,
    type: 'loreKeeper',
    label: '默认设定守护',
    description: '检查角色、地理、时间线、专有名词一致性。',
    builtin: true,
    providerId: 'openai-default',
    model: 'gpt-4o-mini',
    systemPrompt: [
      '你是世界观守护者（LoreKeeper）。检查角色设定、地理、时间线、专有名词一致性，指出冲突。',
      '使用 searchDocuments 与 readDocument 跨章节比对设定，给出冲突清单与建议；只读不写。',
    ].join('\n'),
  },
];

export const DEFAULT_LINEUP_ID = 'default';

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai-default',
    kind: 'openai',
    label: 'OpenAI',
    apiKey: process.env.OPENAI_API_KEY,
  },
];

export const DEFAULT_BINDINGS: Bindings = {
  embedding: {
    providerId: 'openai-default',
    model: 'text-embedding-3-small',
    dimension: 1536,
  },
};

async function readKv<T>(key: string): Promise<T | null> {
  const c = getLibSqlClient();
  const r = await c.execute({ sql: 'SELECT value FROM app_kv WHERE key = ?', args: [key] });
  if (r.rows.length === 0) return null;
  return JSON.parse(r.rows[0]!.value as string) as T;
}

async function writeKv(key: string, value: unknown): Promise<void> {
  const c = getLibSqlClient();
  await c.execute({
    sql: `INSERT INTO app_kv (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [key, JSON.stringify(value), Date.now()],
  });
}

export async function loadProviders(): Promise<ProviderConfig[]> {
  const stored = await readKv<ProviderConfig[]>(PROVIDERS_KEY);
  if (stored && stored.length > 0) return stored;
  await writeKv(PROVIDERS_KEY, DEFAULT_PROVIDERS);
  return DEFAULT_PROVIDERS;
}

export async function loadBindings(): Promise<Bindings> {
  const stored = await readKv<Bindings>(BINDINGS_KEY);
  if (stored) return stored;
  await writeKv(BINDINGS_KEY, DEFAULT_BINDINGS);
  return DEFAULT_BINDINGS;
}

export async function reloadRegistry(): Promise<void> {
  const providers = await loadProviders();
  registry.reload(providers);
}

export async function saveProviders(providers: ProviderConfig[]): Promise<void> {
  await writeKv(PROVIDERS_KEY, providers);
  registry.reload(providers);
}

export async function saveBindings(bindings: Bindings): Promise<void> {
  await writeKv(BINDINGS_KEY, bindings);
  setBindings(bindings);
}

export async function loadAgents(): Promise<AgentDef[]> {
  const stored = await readKv<AgentDef[]>(AGENTS_KEY);
  if (stored && stored.length > 0) {
    const byId = new Map(stored.map((a) => [a.id, a] as const));
    const now = Date.now();
    let mutated = false;
    for (const def of BUILTIN_AGENT_DEFS) {
      const existing = byId.get(def.id);
      if (!existing) {
        byId.set(def.id, { ...def, createdAt: now, updatedAt: now });
        mutated = true;
      } else if (
        !existing.builtin ||
        existing.type !== def.type ||
        typeof existing.providerId !== 'string' ||
        !existing.providerId ||
        typeof existing.model !== 'string' ||
        !existing.model
      ) {
        byId.set(def.id, {
          ...existing,
          type: def.type,
          builtin: true,
          providerId: existing.providerId || def.providerId,
          model: existing.model || def.model,
          updatedAt: now,
        });
        mutated = true;
      }
    }
    const merged = Array.from(byId.values());
    if (mutated) await writeKv(AGENTS_KEY, merged);
    setAgents(merged);
    return merged;
  }
  const now = Date.now();
  const seeded = BUILTIN_AGENT_DEFS.map((def) => ({ ...def, createdAt: now, updatedAt: now }));
  await writeKv(AGENTS_KEY, seeded);
  setAgents(seeded);
  return seeded;
}

export async function saveAgents(agents: AgentDef[]): Promise<void> {
  await writeKv(AGENTS_KEY, agents);
  setAgents(agents);
}

export async function loadLineups(): Promise<Lineup[]> {
  const stored = await readKv<Lineup[]>(LINEUPS_KEY);
  return stored ?? [];
}

export async function saveLineups(lineups: Lineup[]): Promise<void> {
  await writeKv(LINEUPS_KEY, lineups);
}
