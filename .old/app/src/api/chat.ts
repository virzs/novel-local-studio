import { API_BASE } from '../lib/api';

/**
 * 获取 AI 对话接口地址。
 *
 * 未传入 `agentId` 时返回基础 chat 端点；传入后返回指定智能体的 chat 端点。
 */
export function getChatApiUrl(agentId?: string): string {
  return agentId ? `${API_BASE}/api/chat/${agentId}` : `${API_BASE}/api/chat`;
}
