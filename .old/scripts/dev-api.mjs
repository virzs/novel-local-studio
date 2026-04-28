import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

const host = '127.0.0.1';
const port = 4311;
const mastraPort = Number(process.env.MASTRA_PORT ?? 4312);
const apiBase = `http://${host}:${port}`;
const mastraBase = `http://127.0.0.1:${mastraPort}`;

const bootstrap = {
  ready: false,
  phase: 'starting',
  logs: [],
};

function now() {
  return new Date().toISOString();
}

function addLog(level, message) {
  const entry = {
    time: now(),
    level,
    message,
  };

  bootstrap.logs.push(entry);
  if (bootstrap.logs.length > 200) {
    bootstrap.logs.shift();
  }

  console.log(`[${entry.time}] [${level.toUpperCase()}] ${message}`);
}

function setPhase(phase, message) {
  bootstrap.phase = phase;
  addLog('info', message);
}

async function runBootstrap() {
  setPhase('starting', 'Initializing local API service');
  await sleep(120);
  setPhase('checking-mastra', `Mastra agent server: ${mastraBase}`);
  await sleep(160);
  setPhase('readying-routes', 'Registering shell, Mastra, project and agent routes');
  await sleep(160);
  bootstrap.ready = true;
  setPhase('ready', 'Local development API is ready');
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

async function proxyToMastra(req, res, path) {
  const url = `${mastraBase}${path}`;
  const hasBody = req.method === 'POST' || req.method === 'PUT';
  const body = hasBody ? JSON.stringify(await readBody(req)) : undefined;

  const upstream = await fetch(url, {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = await upstream.json();
  sendJson(res, upstream.status, data);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', apiBase);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      status: bootstrap.ready ? 'ok' : 'starting',
      service: 'novel-local-studio',
      mode: 'web-development',
      apiBase,
      mastraBase,
      ready: bootstrap.ready,
      timestamp: now(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
    sendJson(res, 200, bootstrap);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/shell') {
    sendJson(res, 200, {
      app_name: 'Novel Local Studio',
      shell_mode: 'web-development',
      web_access: true,
      version: '0.1.0',
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/mastra') {
    let reachable = false;
    try {
      const probe = await fetch(`${mastraBase}/health`);
      reachable = probe.ok;
    } catch {
      reachable = false;
    }
    sendJson(res, 200, {
      enabled: true,
      base_url: mastraBase,
      gateway_url: `${apiBase}/api/agents`,
      reachable,
    });
    return;
  }

  if (url.pathname === '/api/agents' || url.pathname.startsWith('/api/agents/') ||
      url.pathname === '/api/projects' || url.pathname.startsWith('/api/projects/') ||
      url.pathname === '/api/chapters' || url.pathname.startsWith('/api/chapters/') ||
      url.pathname === '/api/agents-config' || url.pathname.startsWith('/api/agents-config/') ||
      url.pathname === '/api/settings' || url.pathname.startsWith('/api/settings/')) {
    try {
      await proxyToMastra(req, res, url.pathname + url.search);
    } catch (err) {
      sendJson(res, 502, { error: `Mastra agent server unreachable: ${err.message}` });
    }
    return;
  }

  sendJson(res, 404, { message: 'Route not found' });
});

server.listen(port, host, async () => {
  addLog('info', `Listening on ${apiBase}`);
  await runBootstrap();
});
