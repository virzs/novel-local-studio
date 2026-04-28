import { apiClient } from './client';
import type { Provider } from '../types';

export type ProvidersResponse = { providers: Provider[] };
export type ProviderModelsResponse = { data?: { id: string }[]; models?: { name?: string; model?: string }[] };

export type CreateProviderInput = {
  name: string;
  type: string;
  baseUrl: string;
  models: string;
  apiKey?: string;
};

export type UpdateProviderInput = Partial<CreateProviderInput>;

/** 获取所有服务商。 */
export function listProviders(): Promise<ProvidersResponse> {
  return apiClient.get<ProvidersResponse>('/api/providers');
}

/** 创建服务商配置。 */
export function createProvider(input: CreateProviderInput): Promise<Provider> {
  return apiClient.post<Provider>('/api/providers', input);
}

/** 更新服务商配置。 */
export function updateProvider(providerId: string, input: UpdateProviderInput): Promise<Provider> {
  return apiClient.put<Provider>(`/api/providers/${providerId}`, input);
}

/** 删除服务商配置。 */
export function deleteProvider(providerId: string): Promise<void> {
  return apiClient.delete(`/api/providers/${providerId}`);
}

/** 获取指定服务商可用的模型列表。 */
export function getProviderModels(providerId: string): Promise<ProviderModelsResponse> {
  return apiClient.get<ProviderModelsResponse>(`/api/providers/${providerId}/models`);
}
