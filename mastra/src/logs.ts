import { EventEmitter } from 'node:events';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type LogEntry = {
  id: number;
  ts: number;
  level: LogLevel;
  msg: string;
};

const BUFFER_MAX = 500;
const buffer: LogEntry[] = [];
let nextId = 1;
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let installed = false;

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(safeStringify).join(' ');
}

function push(level: LogLevel, msg: string): void {
  const entry: LogEntry = { id: nextId++, ts: Date.now(), level, msg };
  buffer.push(entry);
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  emitter.emit('entry', entry);
}

export function installConsoleCapture(): void {
  if (installed) return;
  installed = true;
  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };
  const wrap = (level: LogLevel, fn: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        push(level, formatArgs(args));
      } catch {
        void 0;
      }
      fn(...args);
    };
  console.log = wrap('log', orig.log);
  console.info = wrap('info', orig.info);
  console.warn = wrap('warn', orig.warn);
  console.error = wrap('error', orig.error);
  console.debug = wrap('debug', orig.debug);
}

export function getRecentLogs(sinceId?: number): LogEntry[] {
  if (typeof sinceId !== 'number') return buffer.slice();
  return buffer.filter((e) => e.id > sinceId);
}

export function subscribeLogs(handler: (entry: LogEntry) => void): () => void {
  emitter.on('entry', handler);
  return () => emitter.off('entry', handler);
}
