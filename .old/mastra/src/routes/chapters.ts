import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { chapters } from '../db/schema.js';
import type { NewChapter } from '../db/schema.js';

function now(): number {
  return Date.now();
}

export const chaptersRouter = new Hono();

chaptersRouter.get('/projects/:projectId/chapters', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const rows = await db.select().from(chapters).where(eq(chapters.projectId, projectId));
  return c.json({ chapters: rows });
});

chaptersRouter.post('/projects/:projectId/chapters', async (c) => {
  const db = getDb();
  const projectId = c.req.param('projectId');
  const body = await c.req.json<Partial<NewChapter>>();
  const row: NewChapter = {
    id: randomUUID(),
    projectId,
    title: body.title ?? 'Untitled Chapter',
    content: body.content ?? '',
    order: body.order ?? 0,
    status: body.status ?? 'draft',
    wordCount: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(chapters).values(row);
  return c.json(row, 201);
});

chaptersRouter.get('/chapters/:id', async (c) => {
  const db = getDb();
  const chapterId = c.req.param('id');
  const [row] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
  if (!row) return c.json({ error: 'Chapter not found' }, 404);
  return c.json(row);
});

chaptersRouter.put('/chapters/:id', async (c) => {
  const db = getDb();
  const chapterId = c.req.param('id');
  const body = await c.req.json<Partial<NewChapter>>();
  const wordCount = typeof body.content === 'string'
    ? body.content.trim().split(/\s+/).filter(Boolean).length
    : undefined;
  await db.update(chapters)
    .set({ ...body, ...(wordCount !== undefined ? { wordCount } : {}), updatedAt: now() })
    .where(eq(chapters.id, chapterId));
  const [updated] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
  return c.json(updated);
});

chaptersRouter.delete('/chapters/:id', async (c) => {
  const db = getDb();
  const chapterId = c.req.param('id');
  await db.delete(chapters).where(eq(chapters.id, chapterId));
  return c.json({ deleted: chapterId });
});
