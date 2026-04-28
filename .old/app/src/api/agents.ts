import { apiClient } from './client';
import type { AgentConfig } from '../types';

export type AgentConfigsResponse = { agents: AgentConfig[] };
export type AgentIdsResponse = { agents: string[] };

export type CreateAgentInput = {
  name: string;
  description?: string | null;
  systemPrompt: string;
  provider: string;
  model: string;
};

export type UpdateAgentInput = Partial<CreateAgentInput>;

/** 获取完整智能体配置列表。 */
export function listAgentConfigs(): Promise<AgentConfigsResponse> {
  return apiClient.get<AgentConfigsResponse>('/api/agents-config');
}

/** 创建自定义智能体配置。 */
export function createAgentConfig(input: CreateAgentInput): Promise<AgentConfig> {
  return apiClient.post<AgentConfig>('/api/agents-config', input);
}

/** 更新智能体配置。 */
export function updateAgentConfig(agentId: string, input: UpdateAgentInput): Promise<AgentConfig> {
  return apiClient.put<AgentConfig>(`/api/agents-config/${agentId}`, input);
}

/** 删除智能体配置。 */
export function deleteAgentConfig(agentId: string): Promise<void> {
  return apiClient.delete(`/api/agents-config/${agentId}`);
}

/** 获取当前可选的智能体 ID 列表。 */
export function listAvailableAgents(): Promise<AgentIdsResponse> {
  return apiClient.get<AgentIdsResponse>('/api/agents');
}
