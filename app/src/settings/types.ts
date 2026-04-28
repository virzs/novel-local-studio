export type ProviderKind = 'openai' | 'openai-compatible';

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: string[];
};

export type ModelBinding = {
  providerId: string;
  model: string;
};

export type AgentType = 'supervisor' | 'architect' | 'chronicler' | 'editor' | 'loreKeeper';

export type EmbeddingBinding = ModelBinding & { dimension: number };

export type Bindings = {
  embedding: EmbeddingBinding;
};

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  supervisor: '总管 Supervisor',
  architect: '架构师 Architect',
  chronicler: '执笔者 Chronicler',
  editor: '编辑 Editor',
  loreKeeper: '设定守护 LoreKeeper',
};

export const AGENT_TYPE_ORDER: AgentType[] = [
  'supervisor',
  'architect',
  'chronicler',
  'editor',
  'loreKeeper',
];

export const BUILTIN_AGENT_IDS: Record<AgentType, string> = {
  supervisor: 'builtin-supervisor',
  architect: 'builtin-architect',
  chronicler: 'builtin-chronicler',
  editor: 'builtin-editor',
  loreKeeper: 'builtin-loreKeeper',
};

export const DEFAULT_LINEUP_ID = 'default';

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
