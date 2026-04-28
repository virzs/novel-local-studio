import { apiClient } from './client';

export type Chapter = {
  id: string;
  title: string;
  content: string;
  order: number;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
};

export type ChaptersResponse = { chapters: Chapter[] };

export type UpdateChapterInput = {
  content?: string;
  title?: string;
};

/** 获取书籍下的章节列表。 */
export function listChapters(projectId: string): Promise<ChaptersResponse> {
  return apiClient.get<ChaptersResponse>(`/api/projects/${projectId}/chapters`);
}

/** 更新指定章节。 */
export function updateChapter(chapterId: string, input: UpdateChapterInput): Promise<Chapter> {
  return apiClient.put<Chapter>(`/api/chapters/${chapterId}`, input);
}
