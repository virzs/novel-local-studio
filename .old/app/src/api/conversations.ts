import { apiClient } from './client';
import type { Conversation } from '../contexts/AIChatContext';

export type ConversationsResponse = { conversations: Conversation[] };

export type ListConversationsParams = {
  projectId?: string;
  agentId?: string;
};

export type CreateConversationInput = {
  agentId: string;
  title?: string;
  projectId?: string;
};

export type UpdateConversationInput = {
  title?: string;
  projectId?: string;
};

export type ConversationMessagesResponse = {
  resourceId?: string;
  messages?: Array<{
    role: string;
    content: { parts?: Array<{ text?: string }>; content?: string } | string;
    id: string;
  }>;
};

/** 获取对话列表，可按书籍或智能体过滤。 */
export function listConversations(params: ListConversationsParams): Promise<ConversationsResponse> {
  const query = new URLSearchParams();
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.agentId) query.set('agentId', params.agentId);
  return apiClient.get<ConversationsResponse>(`/api/conversations?${query.toString()}`);
}

/** 获取单个对话的消息历史。 */
export function getConversation(id: string, agentId: string): Promise<ConversationMessagesResponse> {
  return apiClient.get<ConversationMessagesResponse>(
    `/api/conversations/${id}?agentId=${encodeURIComponent(agentId)}`,
  );
}

/** 创建一条新对话。 */
export function createConversation(input: CreateConversationInput): Promise<Conversation> {
  return apiClient.post<Conversation>('/api/conversations', input);
}

/** 更新对话标题或所属书籍。 */
export function updateConversation(id: string, input: UpdateConversationInput): Promise<Conversation> {
  return apiClient.put<Conversation>(`/api/conversations/${id}`, input);
}

/** 删除一条对话。 */
export function deleteConversation(id: string): Promise<void> {
  return apiClient.delete(`/api/conversations/${id}`);
}
