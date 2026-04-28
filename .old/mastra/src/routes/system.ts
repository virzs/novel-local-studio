import { Hono } from 'hono';
import { getMastra } from '../mastra.js';

export const systemRouter = new Hono();

const APP_VERSION = process.env.APP_VERSION ?? '0.1.0';
const SHELL_MODE = process.env.SHELL_MODE ?? 'web';
const PORT = Number(process.env.MASTRA_PORT ?? 4312);

let _bootstrapLogs: Array<{ time: string; level: string; message: string }> = [];
let _bootstrapReady = false;
let _bootstrapPhase = 'starting';
let _bootstrapError: string | null = null;

function runBootstrap(): void {
  if (_bootstrapReady) return;
  try {
    _bootstrapPhase = 'checking-backend';
    _bootstrapLogs.push({ time: String(Date.now()), level: 'info', message: 'Checking AI backend...' });

    getMastra();

    _bootstrapPhase = 'ready';
    _bootstrapReady = true;
    _bootstrapLogs.push({ time: String(Date.now()), level: 'info', message: 'Backend ready.' });
  } catch (err) {
    _bootstrapError = err instanceof Error ? err.message : 'Unknown error';
    _bootstrapPhase = 'error';
    _bootstrapLogs.push({ time: String(Date.now()), level: 'error', message: _bootstrapError });
  }
}

runBootstrap();

systemRouter.get('/shell', (c) => {
  return c.json({
    app_name: 'Novel Local Studio',
    shell_mode: SHELL_MODE,
    web_access: true,
    version: APP_VERSION,
  });
});

systemRouter.get('/mastra', (c) => {
  const apiBase = `http://127.0.0.1:${PORT}`;
  return c.json({
    enabled: true,
    base_url: apiBase,
    gateway_url: apiBase,
    reachable: _bootstrapReady,
  });
});

systemRouter.get('/bootstrap', (c) => {
  if (!_bootstrapReady) {
    runBootstrap();
  }
  return c.json({
    ready: _bootstrapReady,
    phase: _bootstrapPhase,
    logs: _bootstrapLogs,
    error: _bootstrapError,
  });
});
