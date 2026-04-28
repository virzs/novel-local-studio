import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq, and, ne } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { projects } from '../db/schema.js';
import type { NewProject } from '../db/schema.js';
import { initializeProjectWorld } from '../lib/project-world-init.js';

function now(): number {
  return Date.now();
}

export const projectsRouter = new Hono();

projectsRouter.get('/projects', async (c) => {
  const db = getDb();
  const showArchived = c.req.query('archived') === '1';
  const rows = showArchived
    ? await db.select().from(projects).where(eq(projects.archived, 1)).orderBy(projects.updatedAt)
    : await db.select().from(projects).where(ne(projects.archived, 1)).orderBy(projects.updatedAt);
  return c.json({ projects: rows });
});

projectsRouter.post('/projects', async (c) => {
  const db = getDb();
  const body = await c.req.json<Partial<NewProject>>();
  const row: NewProject = {
    id: randomUUID(),
    name: body.name ?? 'Untitled',
    synopsis: body.synopsis ?? null,
    genre: body.genre ?? null,
    status: body.status ?? 'drafting',
    archived: 0,
    worldInitStatus: 'idle',
    worldInitError: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(projects).values(row);
  void initializeProjectWorld(row.id).catch((err) => {
    console.error(`[projects] failed to auto-initialize world for ${row.id}:`, err);
  });
  return c.json({ project: row }, 201);
});

projectsRouter.get('/projects/:id', async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) return c.json({ error: 'Project not found' }, 404);
  return c.json(row);
});

projectsRouter.put('/projects/:id', async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  const body = await c.req.json<Partial<NewProject>>();
  await db.update(projects).set({ ...body, updatedAt: now() }).where(eq(projects.id, projectId));
  const [updated] = await db.select().from(projects).where(eq(projects.id, projectId));
  return c.json(updated);
});

projectsRouter.post('/projects/:id/world/initialize', async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) return c.json({ error: 'Project not found' }, 404);

  try {
    await initializeProjectWorld(projectId);
  } catch (err) {
    const [failed] = await db.select().from(projects).where(eq(projects.id, projectId));
    return c.json({
      error: err instanceof Error ? err.message : 'World initialization failed',
      project: failed,
    }, 500);
  }

  const [updated] = await db.select().from(projects).where(eq(projects.id, projectId));
  return c.json({ project: updated });
});

projectsRouter.delete('/projects/:id', async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  await db.delete(projects).where(eq(projects.id, projectId));
  return c.json({ deleted: projectId });
});

projectsRouter.put('/projects/:id/archive', async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) return c.json({ error: 'Project not found' }, 404);
  await db.update(projects).set({ archived: 1, updatedAt: now() }).where(eq(projects.id, projectId));
  const [updated] = await db.select().from(projects).where(eq(projects.id, projectId));
  return c.json(updated);
});

projectsRouter.put('/projects/:id/unarchive', async (c) => {
  const db = getDb();
  const projectId = c.req.param('id');
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) return c.json({ error: 'Project not found' }, 404);
  await db.update(projects).set({ archived: 0, updatedAt: now() }).where(eq(projects.id, projectId));
  const [updated] = await db.select().from(projects).where(eq(projects.id, projectId));
  return c.json(updated);
});
