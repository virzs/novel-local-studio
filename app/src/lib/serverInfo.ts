import { invoke, isTauri } from '@tauri-apps/api/core';

export type ServerInfo = { url: string; dataDir: string };

export async function resolveServerInfo(): Promise<ServerInfo> {
  if (isTauri()) {
    return await invoke<ServerInfo>('get_server_info');
  }
  const url = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:18781';
  return { url, dataDir: '(browser dev mode)' };
}

export function isBrowserMode(): boolean {
  return !isTauri();
}
