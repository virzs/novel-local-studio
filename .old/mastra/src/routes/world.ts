import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { ensureWorldSettingTypes } from '../db/db.js';
import { worldSettingTypes, worldSettings } from '../db/schema.js';
import type { NewWorldSettingType, NewWorldSetting } from '../db/schema.js';

function now(): number {
  return Date.now();
}

export const worldRouter = new Hono();

worldRouter.get('/projects/:projectId/world/types', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  await ensureWorldSettingTypes(projectId);
  const rows = await db
    .select()
    .from(worldSettingTypes)
    .where(eq(worldSettingTypes.projectId, projectId))
    .orderBy(worldSettingTypes.sortOrder);
  return c.json({ types: rows });
});

worldRouter.post('/projects/:projectId/world/types', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const body = await c.req.json<Partial<NewWorldSettingType>>();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  const row: NewWorldSettingType = {
    id: randomUUID(),
    projectId,
    name: body.name.trim(),
    icon: body.icon ?? '📖',
    description: body.description ?? null,
    isPreset: 0,
    sortOrder: body.sortOrder ?? 99,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(worldSettingTypes).values(row);
  return c.json(row, 201);
});

worldRouter.put('/world/types/:id', async (c) => {
  const db = getDb();
  const typeId = c.req.param('id');
  const body = await c.req.json<Partial<NewWorldSettingType>>();
  const [existing] = await db.select().from(worldSettingTypes).where(eq(worldSettingTypes.id, typeId));
  if (!existing) return c.json({ error: 'Type not found' }, 404);
  if (existing.isPreset && (body.name || body.icon)) {
    return c.json({ error: 'Cannot rename preset types' }, 403);
  }
  await db.update(worldSettingTypes)
    .set({ ...body, isPreset: existing.isPreset, updatedAt: now() })
    .where(eq(worldSettingTypes.id, typeId));
  const [updated] = await db.select().from(worldSettingTypes).where(eq(worldSettingTypes.id, typeId));
  return c.json(updated);
});

worldRouter.delete('/world/types/:id', async (c) => {
  const db = getDb();
  const typeId = c.req.param('id');
  const [existing] = await db.select().from(worldSettingTypes).where(eq(worldSettingTypes.id, typeId));
  if (!existing) return c.json({ error: 'Type not found' }, 404);
  if (existing.isPreset) return c.json({ error: 'Cannot delete preset types' }, 403);
  await db.delete(worldSettingTypes).where(eq(worldSettingTypes.id, typeId));
  return c.json({ deleted: typeId });
});

worldRouter.get('/projects/:projectId/world/settings', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const typeId = c.req.query('typeId');
  const conditions = typeId
    ? and(eq(worldSettings.projectId, projectId), eq(worldSettings.typeId, typeId))
    : eq(worldSettings.projectId, projectId);
  const rows = await db
    .select()
    .from(worldSettings)
    .where(conditions)
    .orderBy(worldSettings.sortOrder);
  return c.json({ settings: rows });
});

worldRouter.post('/projects/:projectId/world/settings', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const body = await c.req.json<Partial<NewWorldSetting>>();
  if (!body.title?.trim()) return c.json({ error: 'title is required' }, 400);
  if (!body.typeId) return c.json({ error: 'typeId is required' }, 400);
  const row: NewWorldSetting = {
    id: randomUUID(),
    projectId,
    typeId: body.typeId,
    title: body.title.trim(),
    summary: body.summary ?? null,
    content: body.content ?? '',
    tags: body.tags ?? '[]',
    sortOrder: body.sortOrder ?? 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(worldSettings).values(row);
  return c.json(row, 201);
});

worldRouter.get('/world/settings/:id', async (c) => {
  const db = getDb();
  const settingId = c.req.param('id');
  const [row] = await db.select().from(worldSettings).where(eq(worldSettings.id, settingId));
  if (!row) return c.json({ error: 'Setting not found' }, 404);
  return c.json(row);
});

worldRouter.put('/world/settings/:id', async (c) => {
  const db = getDb();
  const settingId = c.req.param('id');
  const body = await c.req.json<Partial<NewWorldSetting>>();
  await db.update(worldSettings)
    .set({ ...body, updatedAt: now() })
    .where(eq(worldSettings.id, settingId));
  const [updated] = await db.select().from(worldSettings).where(eq(worldSettings.id, settingId));
  if (!updated) return c.json({ error: 'Setting not found' }, 404);
  return c.json(updated);
});

worldRouter.delete('/world/settings/:id', async (c) => {
  const db = getDb();
  const settingId = c.req.param('id');
  await db.delete(worldSettings).where(eq(worldSettings.id, settingId));
  return c.json({ deleted: settingId });
});
