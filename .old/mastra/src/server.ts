import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { MastraServer, type HonoBindings, type HonoVariables } from '@mastra/hono';
import { getMastra, initMemory } from './mastra.js';
import { initDb } from './db/db.js';
import { projectsRouter } from './routes/projects.js';
import { chaptersRouter } from './routes/chapters.js';
import { worldRouter } from './routes/world.js';
import { outlinesRouter } from './routes/outlines.js';
import { agentsConfigRouter } from './routes/agents-config.js';
import { conversationsRouter } from './routes/conversations.js';
import { settingsRouter } from './routes/settings.js';
import { providersRouter } from './routes/providers.js';
import { systemRouter } from './routes/system.js';
import { chatRouter } from './routes/chat.js';
import { devDbRouter } from './routes/dev-db.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.MASTRA_PORT ?? 4312);

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

app.onError((err, c) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  return c.json({ error: message }, 500);
});

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'mastra-agent-server',
    mode: 'local',
    apiBase: `http://${HOST}:${PORT}`,
    timestamp: new Date().toISOString(),
  });
});

initDb().then(async () => {
  await initMemory();
  const mastra = getMastra();

  // Use MastraServer adapter — register context middleware only (no auto-routes)
  // to avoid conflicts with custom business routes under /api
  const server = new MastraServer({ app, mastra });
  server.registerContextMiddleware();

  // Mount custom business routes after Mastra context middleware
  app.route('/api', agentsConfigRouter);
  app.route('/api', conversationsRouter);
  app.route('/api', projectsRouter);
  app.route('/api', chaptersRouter);
  app.route('/api', worldRouter);
  app.route('/api', outlinesRouter);
  app.route('/api', settingsRouter);
  app.route('/api', providersRouter);
  app.route('/api', systemRouter);
  app.route('/api', chatRouter);
  app.route('/api', devDbRouter);

  app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

  serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
    console.log(`[mastra] agent server listening on http://${HOST}:${PORT}`);
  });
}).catch((err: unknown) => {
  console.error('[mastra] failed to initialise database:', err);
  process.exit(1);
});
