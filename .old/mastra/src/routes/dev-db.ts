import { Hono } from 'hono';
import { getClient, getSetting } from '../db/db.js';

const SENSITIVE_FIELD_PATTERN = /(api[_-]?key|token|secret|password|credential)/i;
const INTERNAL_TABLES = new Set(['sqlite_sequence']);

function isRuntimeDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

async function isDevDbViewerEnabled(): Promise<boolean> {
  const raw = await getSetting('dev.db_viewer_enabled');
  return raw === '1' || raw === 'true';
}

function isMaskedColumn(columnName: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(columnName);
}

function maskValue(columnName: string, value: unknown): unknown {
  if (value == null) return value;
  if (!isMaskedColumn(columnName)) return value;
  return '***';
}

function parsePagination(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function isSafeIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

async function ensureDevAccess() {
  if (!isRuntimeDev()) {
    return { ok: false as const, status: 404, body: { error: 'Not found' } };
  }
  if (!(await isDevDbViewerEnabled())) {
    return { ok: false as const, status: 403, body: { error: '开发模式数据库查看器未启用' } };
  }
  return { ok: true as const };
}

export const devDbRouter = new Hono();

devDbRouter.get('/dev/db/tables', async (c) => {
  const access = await ensureDevAccess();
  if (!access.ok) return c.json(access.body, access.status);

  const client = getClient();
  const result = await client.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`,
  });

  const tables = (result.rows ?? [])
    .map((row) => String(row.name ?? ''))
    .filter((name) => name && !INTERNAL_TABLES.has(name));

  return c.json({ tables });
});

devDbRouter.get('/dev/db/tables/:table/schema', async (c) => {
  const access = await ensureDevAccess();
  if (!access.ok) return c.json(access.body, access.status);

  const table = c.req.param('table');
  if (!isSafeIdentifier(table)) {
    return c.json({ error: '非法表名' }, 400);
  }

  const client = getClient();
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const columns = (result.rows ?? []).map((row) => ({
    cid: Number(row.cid ?? 0),
    name: String(row.name ?? ''),
    type: String(row.type ?? ''),
    notnull: Number(row.notnull ?? 0) === 1,
    defaultValue: row.dflt_value == null ? null : String(row.dflt_value),
    primaryKey: Number(row.pk ?? 0) === 1,
    masked: isMaskedColumn(String(row.name ?? '')),
  }));

  return c.json({ table, columns });
});

devDbRouter.get('/dev/db/tables/:table/rows', async (c) => {
  const access = await ensureDevAccess();
  if (!access.ok) return c.json(access.body, access.status);

  const table = c.req.param('table');
  if (!isSafeIdentifier(table)) {
    return c.json({ error: '非法表名' }, 400);
  }

  const limit = parsePagination(c.req.query('limit'), 50, 200);
  const offset = parsePagination(c.req.query('offset'), 0, 10000);
  const client = getClient();

  const countResult = await client.execute(`SELECT COUNT(*) as total FROM ${table}`);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const rowResult = await client.execute({
    sql: `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });

  const rows = (rowResult.rows ?? []).map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = maskValue(key, value);
    }
    return normalized;
  });

  return c.json({
    table,
    rows,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    },
  });
});
