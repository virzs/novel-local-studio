import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { outlines } from '../db/schema.js';
import type { NewOutline } from '../db/schema.js';

function now(): number {
  return Date.now();
}

export const outlinesRouter = new Hono();

outlinesRouter.get('/projects/:projectId/outlines', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const rows = await db
    .select()
    .from(outlines)
    .where(eq(outlines.projectId, projectId))
    .orderBy(outlines.order);
  return c.json({ outlines: rows });
});

outlinesRouter.post('/projects/:projectId/outlines', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const body = await c.req.json<Partial<NewOutline>>();
  if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400);

  const siblings = await db
    .select({ order: outlines.order })
    .from(outlines)
    .where(
      body.parentId
        ? and(eq(outlines.projectId, projectId), eq(outlines.parentId, body.parentId))
        : and(eq(outlines.projectId, projectId), eq(outlines.type, 'volume')),
    );
  const maxOrder = siblings.reduce((max, r) => Math.max(max, r.order), -1);

  const row: NewOutline = {
    id: randomUUID(),
    projectId,
    parentId: body.parentId ?? null,
    title: body.title.trim(),
    description: body.description ?? null,
    type: body.type ?? 'chapter',
    order: body.order ?? maxOrder + 1,
    status: body.status ?? 'draft',
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(outlines).values(row);
  return c.json(row, 201);
});

outlinesRouter.put('/outlines/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = await c.req.json<Partial<NewOutline>>();
  const [existing] = await db.select().from(outlines).where(eq(outlines.id, id));
  if (!existing) return c.json({ error: 'Outline not found' }, 404);

  const updates: Partial<NewOutline> & { updatedAt: number } = { updatedAt: now() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.order !== undefined) updates.order = body.order;
  if (body.parentId !== undefined) updates.parentId = body.parentId;

  await db.update(outlines).set(updates).where(eq(outlines.id, id));
  const [updated] = await db.select().from(outlines).where(eq(outlines.id, id));
  return c.json(updated);
});

outlinesRouter.delete('/outlines/:id', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const [existing] = await db.select().from(outlines).where(eq(outlines.id, id));
  if (!existing) return c.json({ error: 'Outline not found' }, 404);

  if (existing.type === 'volume') {
    await db.delete(outlines).where(and(eq(outlines.projectId, existing.projectId), eq(outlines.parentId, id)));
  }
  await db.delete(outlines).where(eq(outlines.id, id));
  return c.json({ deleted: id });
});
