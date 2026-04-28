export type Health = {
  status: string;
  service: string;
  mode: string;
  apiBase: string;
  mastraBase: string;
  ready: boolean;
  error?: string | null;
  timestamp: string;
};

export type BootstrapLog = {
  time: string;
  level: string;
  message: string;
};

export type BootstrapState = {
  ready: boolean;
  phase: string;
  logs: BootstrapLog[];
  error?: string | null;
};

export type ShellInfo = {
  app_name: string;
  shell_mode: string;
  web_access: boolean;
  version: string;
};

export type Project = {
  id: string;
  name: string;
  synopsis: string | null;
  genre: string | null;
  status: string;
  archived: number;
  worldInitStatus: 'idle' | 'running' | 'ready' | 'failed';
  worldInitError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type AgentConfig = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  model: string;
  provider: string;
  isPreset: number;
  createdAt: number;
  updatedAt: number;
};

export type MastraInfo = {
  enabled: boolean;
  base_url: string;
  gateway_url: string;
  reachable: boolean;
};

export type Provider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string | null;
  models: string;
  isPreset: number;
  enabled: number;
  createdAt: number;
  updatedAt: number;
};

export type WorldSettingType = {
  id: string;
  projectId: string;
  name: string;
  icon: string;
  description: string | null;
  isPreset: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type WorldSetting = {
  id: string;
  projectId: string;
  typeId: string;
  title: string;
  summary: string | null;
  content: string;
  tags: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};
