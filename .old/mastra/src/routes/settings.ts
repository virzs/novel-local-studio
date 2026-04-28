import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { settings } from '../db/schema.js';

function now(): number {
  return Date.now();
}

export const settingsRouter = new Hono();

settingsRouter.get('/settings', async (c) => {
  const db = getDb();
  const rows = await db.select().from(settings);
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    result[row.key] = row.key.includes('api_key') && row.value ? '***' : row.value;
  }
  return c.json({ settings: result });
});

settingsRouter.get('/settings/:key', async (c) => {
  const db = getDb();
  const key = c.req.param('key');
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row) return c.json({ error: 'Setting not found' }, 404);
  const value = key.includes('api_key') && row.value ? '***' : row.value;
  return c.json({ key, value });
});

settingsRouter.put('/settings/:key', async (c) => {
  const db = getDb();
  const key = c.req.param('key');
  const body = await c.req.json<{ value?: string }>();
  const value = body.value ?? null;
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now() } });
  return c.json({ key, updated: true });
});
