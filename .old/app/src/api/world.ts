import { apiClient } from './client';
import type { WorldSettingType, WorldSetting } from '../types';

export type WorldSettingTypesResponse = { types: WorldSettingType[] };
export type WorldSettingsResponse = { settings: WorldSetting[] };

export type CreateWorldTypeInput = {
  name: string;
  icon: string;
  description?: string | null;
};

export type UpdateWorldTypeInput = Partial<CreateWorldTypeInput>;

export type CreateWorldSettingInput = {
  title: string;
  summary?: string | null;
  content?: string;
  tags?: string;
  typeId: string;
};

export type UpdateWorldSettingInput = Partial<CreateWorldSettingInput>;

/** 获取书籍下的世界设定分类。 */
export function listWorldTypes(projectId: string): Promise<WorldSettingTypesResponse> {
  return apiClient.get<WorldSettingTypesResponse>(`/api/projects/${projectId}/world/types`);
}

/** 为指定书籍创建世界设定分类。 */
export function createWorldType(projectId: string, input: CreateWorldTypeInput): Promise<WorldSettingType> {
  return apiClient.post<WorldSettingType>(`/api/projects/${projectId}/world/types`, input);
}

/** 更新世界设定分类。 */
export function updateWorldType(typeId: string, input: UpdateWorldTypeInput): Promise<WorldSettingType> {
  return apiClient.put<WorldSettingType>(`/api/world/types/${typeId}`, input);
}

/** 删除世界设定分类。 */
export function deleteWorldType(typeId: string): Promise<void> {
  return apiClient.delete(`/api/world/types/${typeId}`);
}

/** 获取书籍下的世界设定条目，可按分类过滤。 */
export function listWorldSettings(projectId: string, typeId?: string): Promise<WorldSettingsResponse> {
  const path = typeId
    ? `/api/projects/${projectId}/world/settings?typeId=${typeId}`
    : `/api/projects/${projectId}/world/settings`;
  return apiClient.get<WorldSettingsResponse>(path);
}

/** 创建世界设定条目。 */
export function createWorldSetting(projectId: string, input: CreateWorldSettingInput): Promise<WorldSetting> {
  return apiClient.post<WorldSetting>(`/api/projects/${projectId}/world/settings`, input);
}

/** 更新世界设定条目。 */
export function updateWorldSetting(settingId: string, input: UpdateWorldSettingInput): Promise<WorldSetting> {
  return apiClient.put<WorldSetting>(`/api/world/settings/${settingId}`, input);
}

/** 删除世界设定条目。 */
export function deleteWorldSetting(settingId: string): Promise<void> {
  return apiClient.delete(`/api/world/settings/${settingId}`);
}
