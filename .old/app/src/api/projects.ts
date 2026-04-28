import { apiClient } from './client';
import type { Project } from '../types';

export type CreateProjectInput = {
  name: string;
  genre?: string | null;
  synopsis?: string | null;
};

export type ProjectsResponse = { projects: Project[] };
export type ProjectResponse = { project: Project };

/** 获取未归档书籍列表。 */
export function listProjects(): Promise<ProjectsResponse> {
  return apiClient.get<ProjectsResponse>('/api/projects');
}

/** 获取已归档书籍列表。 */
export function listArchivedProjects(): Promise<ProjectsResponse> {
  return apiClient.get<ProjectsResponse>('/api/projects?archived=1');
}

/** 创建一本新书。 */
export function createProject(input: CreateProjectInput): Promise<ProjectResponse> {
  return apiClient.post<ProjectResponse>('/api/projects', input);
}

export function initializeProjectWorld(projectId: string): Promise<ProjectResponse> {
  return apiClient.post<ProjectResponse>(`/api/projects/${projectId}/world/initialize`);
}

/** 归档指定书籍。 */
export function archiveProject(projectId: string): Promise<void> {
  return apiClient.put(`/api/projects/${projectId}/archive`);
}

/** 恢复已归档书籍。 */
export function unarchiveProject(projectId: string): Promise<void> {
  return apiClient.put(`/api/projects/${projectId}/unarchive`);
}

/** 删除指定书籍。 */
export function deleteProject(projectId: string): Promise<void> {
  return apiClient.delete(`/api/projects/${projectId}`);
}
