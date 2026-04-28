import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { getDbUrl } from './libsql.ts';

let _storage: LibSQLStore | null = null;
let _memory: Memory | null = null;

export function getMastraStorage(): LibSQLStore {
  if (!_storage) {
    _storage = new LibSQLStore({ id: 'nls-storage', url: getDbUrl() });
  }
  return _storage;
}

export function getMastraMemory(): Memory {
  if (!_memory) {
    _memory = new Memory({ storage: getMastraStorage() });
  }
  return _memory;
}
