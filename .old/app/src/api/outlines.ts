import { apiClient } from './client';

export type Outline = {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  type: 'volume' | 'chapter';
  order: number;
  status: 'draft' | 'done';
  createdAt: number;
  updatedAt: number;
};

export type OutlinesResponse = { outlines: Outline[] };

export type CreateOutlineInput = {
  type: 'volume' | 'chapter';
  parentId?: string | null;
  title: string;
  order: number;
  status?: 'draft' | 'done';
};

export type UpdateOutlineInput = {
  title?: string;
  description?: string | null;
  status?: 'draft' | 'done';
};

/** 获取指定书籍的大纲节点列表。 */
export function listOutlines(projectId: string): Promise<OutlinesResponse> {
  return apiClient.get<OutlinesResponse>(`/api/projects/${projectId}/outlines`);
}

/** 创建大纲节点。 */
export function createOutline(projectId: string, input: CreateOutlineInput): Promise<Outline> {
  return apiClient.post<Outline>(`/api/projects/${projectId}/outlines`, input);
}

/** 更新大纲节点。 */
export function updateOutline(outlineId: string, input: UpdateOutlineInput): Promise<Outline> {
  return apiClient.put<Outline>(`/api/outlines/${outlineId}`, input);
}

/** 删除大纲节点。 */
export function deleteOutline(outlineId: string): Promise<void> {
  return apiClient.delete(`/api/outlines/${outlineId}`);
}
