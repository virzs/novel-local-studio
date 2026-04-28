import { eq } from 'drizzle-orm';
import { getDb } from '../db/db.js';
import { providers } from '../db/schema.js';

export async function resolveProvider(
  providerName: string,
  model?: string,
): Promise<{ baseUrl: string; apiKey: string | null } | null> {
  const db = getDb();
  const all = await db.select().from(providers).where(eq(providers.enabled, 1));
  if (all.length === 0) return null;

  const byName = all.find(
    (p) =>
      p.name.toLowerCase() === providerName.toLowerCase() ||
      p.type.toLowerCase() === providerName.toLowerCase() ||
      p.id.toLowerCase() === providerName.toLowerCase(),
  );
  if (byName) return { baseUrl: byName.baseUrl.replace(/\/$/, ''), apiKey: byName.apiKey ?? null };

  if (model) {
    const byModel = all.find((p) => {
      try {
        return (JSON.parse(p.models) as string[]).includes(model);
      } catch {
        return false;
      }
    });
    if (byModel) return { baseUrl: byModel.baseUrl.replace(/\/$/, ''), apiKey: byModel.apiKey ?? null };
  }

  return null;
}
