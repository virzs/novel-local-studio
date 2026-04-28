import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { agents } from '../db/schema.js';
import type { NewAgent } from '../db/schema.js';

function now(): number {
  return Date.now();
}

export const agentsConfigRouter = new Hono();

agentsConfigRouter.get('/agents', async (c) => {
  const db = getDb();
  const rows = await db.select({ id: agents.id }).from(agents).orderBy(agents.createdAt);
  return c.json({ agents: rows.map((r) => r.id) });
});

agentsConfigRouter.get('/agents-config', async (c) => {
  const db = getDb();
  const rows = await db.select().from(agents).orderBy(agents.createdAt);
  return c.json({ agents: rows });
});

agentsConfigRouter.post('/agents-config', async (c) => {
  const db = getDb();
  const body = await c.req.json<Partial<NewAgent>>();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  const row: NewAgent = {
    id: randomUUID(),
    name: body.name.trim(),
    description: body.description ?? null,
    systemPrompt: body.systemPrompt ?? '',
    model: body.model ?? '',
    provider: body.provider ?? '',
    isPreset: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(agents).values(row);
  return c.json(row, 201);
});

agentsConfigRouter.get('/agents-config/:id', async (c) => {
  const db = getDb();
  const agentId = c.req.param('id');
  const [row] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!row) return c.json({ error: 'Agent not found' }, 404);
  return c.json(row);
});

agentsConfigRouter.put('/agents-config/:id', async (c) => {
  const db = getDb();
  const agentId = c.req.param('id');
  const [existing] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!existing) return c.json({ error: 'Agent not found' }, 404);
  const body = await c.req.json<Partial<NewAgent>>();
  await db.update(agents)
    .set({ ...body, isPreset: existing.isPreset, updatedAt: now() })
    .where(eq(agents.id, agentId));
  const [updated] = await db.select().from(agents).where(eq(agents.id, agentId));
  return c.json(updated);
});

agentsConfigRouter.delete('/agents-config/:id', async (c) => {
  const db = getDb();
  const agentId = c.req.param('id');
  const [existing] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!existing) return c.json({ error: 'Agent not found' }, 404);
  if (existing.isPreset === 1) return c.json({ error: 'Cannot delete preset agent' }, 403);
  await db.delete(agents).where(eq(agents.id, agentId));
  return c.json({ deleted: agentId });
});
