import { apiClient } from './client';
import type { Health, ShellInfo, MastraInfo, BootstrapState } from '../types';

export type SettingsResponse = { settings: Record<string, string | null> };
export type DbTablesResponse = { tables: string[] };
export type DbTableSchemaResponse = {
  table: string;
  columns: Array<{
    cid: number;
    name: string;
    type: string;
    notnull: boolean;
    defaultValue: string | null;
    primaryKey: boolean;
    masked: boolean;
  }>;
};
export type DbTableRowsResponse = {
  table: string;
  rows: Record<string, unknown>[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

/** 获取本地服务健康状态。 */
export function getHealth(): Promise<Health> {
  return apiClient.get<Health>('/health');
}

/** 获取应用壳层信息。 */
export function getShellInfo(): Promise<ShellInfo> {
  return apiClient.get<ShellInfo>('/api/shell');
}

/** 获取 Mastra 服务状态。 */
export function getMastraInfo(): Promise<MastraInfo> {
  return apiClient.get<MastraInfo>('/api/mastra');
}

/** 获取启动引导状态与日志。 */
export function getBootstrapState(): Promise<BootstrapState> {
  return apiClient.get<BootstrapState>('/api/bootstrap');
}

/** 获取全局设置项。 */
export function getSettings(): Promise<SettingsResponse> {
  return apiClient.get<SettingsResponse>('/api/settings');
}

/** 更新单个全局设置项。 */
export function updateSetting(key: string, value: string | null): Promise<void> {
  return apiClient.put(`/api/settings/${key}`, { value });
}

/** 获取可查看的数据库表列表。 */
export function listDatabaseTables(): Promise<DbTablesResponse> {
  return apiClient.get<DbTablesResponse>('/api/dev/db/tables');
}

/** 获取指定表的字段结构。 */
export function getDatabaseTableSchema(table: string): Promise<DbTableSchemaResponse> {
  return apiClient.get<DbTableSchemaResponse>(`/api/dev/db/tables/${encodeURIComponent(table)}/schema`);
}

/** 获取指定表的分页数据。 */
export function getDatabaseTableRows(table: string, limit = 50, offset = 0): Promise<DbTableRowsResponse> {
  return apiClient.get<DbTableRowsResponse>(
    `/api/dev/db/tables/${encodeURIComponent(table)}/rows?limit=${limit}&offset=${offset}`,
  );
}
