import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { providers } from '../db/schema.js';
import type { NewProvider } from '../db/schema.js';

function now(): number {
  return Date.now();
}

export const providersRouter = new Hono();

providersRouter.get('/providers', async (c) => {
  const db = getDb();
  const rows = await db.select().from(providers).orderBy(providers.createdAt);
  return c.json({ providers: rows });
});

providersRouter.post('/providers', async (c) => {
  const db = getDb();
  const body = await c.req.json<Partial<NewProvider>>();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  if (!body.baseUrl?.trim()) return c.json({ error: 'baseUrl is required' }, 400);
  const row: NewProvider = {
    id: randomUUID(),
    name: body.name.trim(),
    type: body.type ?? 'custom',
    baseUrl: body.baseUrl.trim(),
    apiKey: body.apiKey ?? null,
    models: body.models ?? '[]',
    isPreset: 0,
    enabled: body.enabled ?? 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(providers).values(row);
  return c.json(row, 201);
});

providersRouter.get('/providers/:id/models', async (c) => {
  const db = getDb();
  const providerId = c.req.param('id');
  const [provider] = await db.select().from(providers).where(eq(providers.id, providerId));
  if (!provider) return c.json({ error: 'Provider not found' }, 404);
  const fetchUrl = `${provider.baseUrl.replace(/\/$/, '')}/models`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
  const upstream = await fetch(fetchUrl, { headers });
  if (!upstream.ok) return c.json({ error: `Upstream returned ${upstream.status}` }, 502);
  const data = await upstream.json() as unknown;
  return c.json(data as Record<string, unknown>);
});

providersRouter.get('/providers/:id', async (c) => {
  const db = getDb();
  const providerId = c.req.param('id');
  const [row] = await db.select().from(providers).where(eq(providers.id, providerId));
  if (!row) return c.json({ error: 'Provider not found' }, 404);
  return c.json(row);
});

providersRouter.put('/providers/:id', async (c) => {
  const db = getDb();
  const providerId = c.req.param('id');
  const [existing] = await db.select().from(providers).where(eq(providers.id, providerId));
  if (!existing) return c.json({ error: 'Provider not found' }, 404);
  const body = await c.req.json<Partial<NewProvider>>();
  const updateData: Partial<NewProvider> = { ...body, updatedAt: now() };
  if (body.apiKey === undefined) {
    delete updateData.apiKey;
  }
  await db.update(providers).set(updateData).where(eq(providers.id, providerId));
  const [updated] = await db.select().from(providers).where(eq(providers.id, providerId));
  return c.json(updated);
});

providersRouter.delete('/providers/:id', async (c) => {
  const db = getDb();
  const providerId = c.req.param('id');
  const [existing] = await db.select().from(providers).where(eq(providers.id, providerId));
  if (!existing) return c.json({ error: 'Provider not found' }, 404);
  if (existing.isPreset === 1) return c.json({ error: 'Cannot delete preset provider' }, 403);
  await db.delete(providers).where(eq(providers.id, providerId));
  return c.json({ deleted: providerId });
});

