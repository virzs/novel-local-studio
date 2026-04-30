import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import fs from 'node:fs';
import { Mastra } from '@mastra/core/mastra';
import { handleChatStream, type ChatStreamHandlerParams } from '@mastra/ai-sdk';
import { RequestContext } from '@mastra/core/request-context';
import { createUIMessageStreamResponse, generateText } from 'ai';
import { convertMessages } from '@mastra/core/agent';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { AppRequestContextValues } from './shared/request-context.ts';
import { getMastraStorage, getMastraMemory } from './db/mastra-store.ts';
import { parseArgs } from './util/args.ts';
import { installConsoleCapture, getRecentLogs, subscribeLogs, type LogEntry } from './logs.ts';

installConsoleCapture();
import { initLibSqlClient, runBusinessMigrations, getDbPath } from './db/libsql.ts';
import { initFtsDb, setupFtsSchema, backfillFts, closeFtsDb } from './db/fts.ts';
import { initVectorStore, getVectorStore, ensureNovelIndex, VECTOR_DIMENSION } from './db/vector.ts';
import {
  listBooks,
  getBook,
  createBook,
  updateBook,
  deleteBook,
  getDocumentTree,
  getDocument,
  archiveDocument,
  restoreDocument,
  deleteDocument,
  purgeDocument,
  seedSampleBookIfEmpty,
  setEmbedHooks,
} from './db/books.ts';
import {
  reloadRegistry,
  loadBindings,
  loadProviders,
  saveProviders,
  saveBindings,
  loadAgents,
  saveAgents,
  loadLineups,
  saveLineups,
  AGENT_TYPES,
  BUILTIN_AGENT_IDS,
  DEFAULT_LINEUP_ID,
  type AgentDef,
  type AgentType,
  type Lineup,
} from './llm/bindings.ts';
import { registry, type ProviderConfig, type Bindings } from './llm/providers.ts';
import { allAgents, createRuntimeAgents, setBindings } from './agents/index.ts';
import {
  embedDocumentByIdSafe,
  deleteDocumentEmbeddings,
  backfillEmbeddings,
} from './rag/embeddings.ts';

type AgentMetadataId = 'supervisor' | 'architect' | 'chronicler' | 'editor' | 'loreKeeper';

const AGENT_ORDER: AgentMetadataId[] = ['supervisor', 'architect', 'chronicler', 'editor', 'loreKeeper'];

const AGENT_LABELS: Record<AgentMetadataId, string> = {
  supervisor: '总编辑 Supervisor',
  architect: '架构师 Architect',
  chronicler: '编年史 Chronicler',
  editor: '编辑 Editor',
  loreKeeper: '设定守护 LoreKeeper',
};

const nullableTrimmedString = z.preprocess(
  (value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  },
  z.string().nullable().optional(),
);

const createBookSchema = z.object({
  title: z.string().trim().min(1),
  synopsis: nullableTrimmedString,
  status: z.string().trim().min(1).optional(),
  lineupId: nullableTrimmedString,
});

const updateBookSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    synopsis: nullableTrimmedString,
    status: z.string().trim().min(1).optional(),
    lineupId: nullableTrimmedString,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'at least one field is required' });

async function validateLineupId(lineupId: string | null | undefined): Promise<string | null> {
  if (lineupId === undefined || lineupId === null) return lineupId ?? null;
  const lineups = await loadLineups();
  const validIds = new Set([DEFAULT_LINEUP_ID, ...lineups.map((lineup) => lineup.id)]);
  if (!validIds.has(lineupId)) {
    throw new Error(`invalid lineupId: ${lineupId}`);
  }
  return lineupId;
}

async function loadProviderConfig(providerId: string): Promise<ProviderConfig | null> {
  const providers = await loadProviders();
  return providers.find((provider) => provider.id === providerId) ?? null;
}

class ChatRequestError extends Error {}

type ChatRequestBody = ChatStreamHandlerParams & {
  bookId?: unknown;
  threadId?: unknown;
};

type ResolvedLineupAgents = {
  lineupId: string;
  agentDefs: Map<AgentType, AgentDef>;
};

const defaultLineup: Lineup = {
  id: DEFAULT_LINEUP_ID,
  label: '默认阵容',
  agents: { ...BUILTIN_AGENT_IDS },
  createdAt: 0,
  updatedAt: 0,
};

function createMastraInstance(agents: typeof allAgents | ReturnType<typeof createRuntimeAgents>): Mastra {
  return new Mastra({
    agents,
    storage: getMastraStorage(),
    vectors: { novel: getVectorStore() },
    logger: false,
  });
}

async function resolveLineupAgentDefs(bookId: string): Promise<ResolvedLineupAgents> {
  const book = await getBook(bookId);
  if (!book) {
    throw new ChatRequestError('Book not found');
  }

  if (!book.lineupId) {
    throw new ChatRequestError('该书未绑定有效阵容');
  }

  const lineups = await loadLineups();
  const validLineupIds = new Set([DEFAULT_LINEUP_ID, ...lineups.map((lineup) => lineup.id)]);
  if (!validLineupIds.has(book.lineupId)) {
    throw new ChatRequestError('该书未绑定有效阵容');
  }

  const lineup = book.lineupId === DEFAULT_LINEUP_ID
    ? defaultLineup
    : lineups.find((entry) => entry.id === book.lineupId);

  if (!lineup) {
    throw new ChatRequestError('该书未绑定有效阵容');
  }

  const storedAgentsById = new Map((await loadAgents()).map((agentDef) => [agentDef.id, agentDef] as const));
  const agentDefs = new Map<AgentType, AgentDef>();

  for (const type of AGENT_TYPES) {
    const agentId = lineup.agents[type];
    if (typeof agentId !== 'string' || !agentId.trim()) {
      throw new ChatRequestError(`阵容不完整: 缺少 ${type}`);
    }

    const agentDef = storedAgentsById.get(agentId);

    if (!agentDef) {
      throw new ChatRequestError(`agent not found: ${agentId}`);
    }

    if (agentDef.type !== type) {
      throw new ChatRequestError(`lineup ${lineup.id}: agent ${agentId} type ${agentDef.type} != slot ${type}`);
    }

    agentDefs.set(type, agentDef);
  }

  return {
    lineupId: lineup.id,
    agentDefs,
  };
}

function getModelsEndpoint(baseUrl?: string): string {
  const normalizedBaseUrl = (baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/v1') ? `${normalizedBaseUrl}/models` : `${normalizedBaseUrl}/v1/models`;
}

async function main() {
  const { port, dataDir } = parseArgs(process.argv.slice(2));

  fs.mkdirSync(dataDir, { recursive: true });

  initLibSqlClient(dataDir);
  await runBusinessMigrations();

  initFtsDb();
  setupFtsSchema();

  await seedSampleBookIfEmpty();
  backfillFts();

  initVectorStore();
  await ensureNovelIndex();

  await reloadRegistry();

  await loadAgents();

  const bindings = await loadBindings();
  setBindings(bindings);

  setEmbedHooks({
    onUpsert: (id) => {
      void embedDocumentByIdSafe(id);
    },
    onDelete: (id) => {
      void deleteDocumentEmbeddings(id).catch((e) =>
        console.warn(`[embed] delete failed for ${id}:`, (e as Error).message),
      );
    },
  });

  void backfillEmbeddings()
    .then((r) => console.log(`[embed] backfill: embedded=${r.embedded} skipped=${r.skipped} failed=${r.failed}`))
    .catch((e) => console.warn('[embed] backfill error:', (e as Error).message));

  const app = new Hono();
  app.use('*', cors());

  const startedAt = Date.now();
  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      startedAt,
      dbPath: getDbPath(),
      vectorDimension: VECTOR_DIMENSION,
      agents: Object.keys(allAgents),
    }),
  );

  app.get('/api/logs', (c) => {
    const sinceParam = c.req.query('since');
    const sinceId = sinceParam ? Number(sinceParam) : undefined;
    return c.json({ entries: getRecentLogs(Number.isFinite(sinceId) ? sinceId : undefined) });
  });

  app.get('/api/logs/stream', (c) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        const send = (entry: LogEntry) => {
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(entry)}\n\n`));
          } catch {
            void 0;
          }
        };
        for (const e of getRecentLogs()) send(e);
        const unsub = subscribeLogs(send);
        const ping = setInterval(() => {
          try {
            controller.enqueue(enc.encode(': ping\n\n'));
          } catch {
            void 0;
          }
        }, 15000);
        const abort = c.req.raw.signal;
        const cleanup = () => {
          clearInterval(ping);
          unsub();
          try {
            controller.close();
          } catch {
            void 0;
          }
        };
        if (abort.aborted) cleanup();
        else abort.addEventListener('abort', cleanup, { once: true });
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  });

  app.post('/api/chat/:agentId', async (c) => {
    const agentId = c.req.param('agentId');
    const params = await c.req.json<ChatRequestBody>();
    const rawBookId = params.bookId;
    const normalizedBookId =
      typeof rawBookId === 'string' && rawBookId.trim() ? rawBookId.trim() : undefined;
    if (!normalizedBookId) {
      return c.json({ error: '缺少 bookId：请先在左侧创建并选中一本书' }, 400);
    }
    const rawThreadId = params.threadId;
    const normalizedThreadId =
      typeof rawThreadId === 'string' && rawThreadId.trim() ? rawThreadId.trim() : undefined;
    if (!normalizedThreadId) {
      return c.json(
        { error: '缺少 threadId：请先创建或选择一个会话' },
        400,
      );
    }
    try {
      const reqStartedAt = Date.now();
      const reqId = `req_${reqStartedAt.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      console.log(
        `[chat:${reqId}] start agent=${agentId} bookId=${normalizedBookId} threadId=${normalizedThreadId} msgs=${Array.isArray(params.messages) ? params.messages.length : 0}`,
      );
      const { lineupId, agentDefs } = await resolveLineupAgentDefs(normalizedBookId);
      const requestAgents = createRuntimeAgents(agentDefs);
      console.log(
        `[chat:${reqId}] lineup=${lineupId} agents=${AGENT_TYPES.map((type) => {
          const agentDef = agentDefs.get(type);
          return `${type}:${agentDef?.providerId ?? 'unknown'}/${agentDef?.model ?? 'unknown'}`;
        }).join(', ')}`,
      );

      let chunkCount = 0;
      let textChars = 0;
      let firstChunkAt: number | null = null;
      let stepCount = 0;

      const stream = await handleChatStream({
        mastra: createMastraInstance(requestAgents),
        agentId,
        params: {
          ...params,
          requestContext: new RequestContext<AppRequestContextValues>([
            ['bookId', normalizedBookId],
            ['parentThreadId', normalizedThreadId],
          ]),
          memory: { thread: normalizedThreadId, resource: normalizedBookId },
          onChunk: (chunk: unknown) => {
            chunkCount += 1;
            const c = chunk as { type?: string; payload?: { text?: string } } | undefined;
            if (firstChunkAt === null) {
              firstChunkAt = Date.now();
              console.log(
                `[chat:${reqId}] first-chunk type=${c?.type ?? 'unknown'} ttfb=${firstChunkAt - reqStartedAt}ms`,
              );
            }
            if (c?.type === 'text-delta' && typeof c?.payload?.text === 'string') {
              textChars += c.payload.text.length;
            }
          },
          onStepFinish: (event: unknown) => {
            stepCount += 1;
            const step = event as
              | {
                  stepType?: string;
                  toolCalls?: Array<{ payload?: { toolName?: string } }>;
                  toolResults?: Array<{ payload?: { toolName?: string; isError?: boolean } }>;
                  text?: string;
                }
              | undefined;
            const calls = Array.isArray(step?.toolCalls)
              ? step.toolCalls.map((t) => t?.payload?.toolName ?? '?').join(',')
              : '';
            const results = Array.isArray(step?.toolResults)
              ? step.toolResults
                  .map((r) => `${r?.payload?.toolName ?? '?'}${r?.payload?.isError ? '!' : ''}`)
                  .join(',')
              : '';
            const textLen = typeof step?.text === 'string' ? step.text.length : 0;
            console.log(
              `[chat:${reqId}] step#${stepCount} type=${step?.stepType ?? 'unknown'}${calls ? ` calls=[${calls}]` : ''}${results ? ` results=[${results}]` : ''} textLen=${textLen}`,
            );
          },
          onFinish: (event: unknown) => {
            const result = event as
              | { finishReason?: string; usage?: { totalTokens?: number } }
              | undefined;
            const elapsed = Date.now() - reqStartedAt;
            console.log(
              `[chat:${reqId}] done elapsed=${elapsed}ms chunks=${chunkCount} textChars=${textChars} steps=${stepCount} reason=${result?.finishReason ?? '?'} totalTokens=${result?.usage?.totalTokens ?? '?'}`,
            );
          },
          onError: (event: unknown) => {
            const e = (event as { error?: unknown })?.error ?? event;
            if (e instanceof Error) {
              console.error(`[chat:${reqId}] stream-error: ${e.message}`);
              if (e.stack) console.error(`[chat:${reqId}] stack:\n${e.stack}`);
              const cause = (e as { cause?: unknown }).cause;
              if (cause) {
                const causeMsg = cause instanceof Error ? `${cause.message}\n${cause.stack ?? ''}` : JSON.stringify(cause);
                console.error(`[chat:${reqId}] cause:\n${causeMsg}`);
              }
            } else {
              console.error(`[chat:${reqId}] stream-error:`, e);
            }
          },
          delegation: {
            onDelegationStart: (event: unknown) => {
              const e = event as { primitiveId?: string; prompt?: string } | undefined;
              const preview =
                typeof e?.prompt === 'string' ? e.prompt.slice(0, 80).replace(/\s+/g, ' ') : '';
              console.log(
                `[chat:${reqId}] delegate→ ${e?.primitiveId ?? '?'}${preview ? ` prompt="${preview}${e?.prompt && e.prompt.length > 80 ? '…' : ''}"` : ''}`,
              );
            },
            onDelegationComplete: (event: unknown) => {
              const e = event as { primitiveId?: string; result?: { text?: string } } | undefined;
              const len = typeof e?.result?.text === 'string' ? e.result.text.length : 0;
              console.log(`[chat:${reqId}] delegate← ${e?.primitiveId ?? '?'} textLen=${len}`);
            },
          },
        },
        version: 'v6',
      });
      return createUIMessageStreamResponse({ stream });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = err instanceof ChatRequestError ? 400 : 500;
      console.error(`[chat] fatal: ${msg}`);
      return c.json({ error: msg }, status);
    }
  });

  app.get('/api/config/providers', async (c) => {
    return c.json({ providers: await loadProviders() });
  });

  app.put('/api/config/providers', async (c) => {
    const body = (await c.req.json()) as { providers: ProviderConfig[] };
    if (!Array.isArray(body?.providers)) {
      return c.json({ error: 'providers must be an array' }, 400);
    }
    await saveProviders(body.providers);
    return c.json({ ok: true });
  });

  app.get('/api/config/bindings', async (c) => {
    return c.json({ bindings: await loadBindings() });
  });

  app.put('/api/config/bindings', async (c) => {
    const body = (await c.req.json()) as { bindings: Bindings };
    const emb = body?.bindings?.embedding;
    if (
      !emb ||
      typeof emb.providerId !== 'string' ||
      !emb.providerId ||
      typeof emb.model !== 'string' ||
      !emb.model ||
      typeof emb.dimension !== 'number'
    ) {
      return c.json({ error: 'invalid embedding binding' }, 400);
    }
    await saveBindings(body.bindings);
    return c.json({ ok: true });
  });

  app.post('/api/config/test', async (c) => {
    const body = (await c.req.json()) as {
      providerId?: string;
      model: string;
      provider?: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> };
    };
    if (!body?.model) {
      return c.json({ error: 'model required' }, 400);
    }

    try {
      let model: unknown;
      if (body.provider) {
        const inline = createOpenAI({
          baseURL: body.provider.baseUrl,
          apiKey: body.provider.apiKey,
          headers: body.provider.headers,
        });
        model = inline.chat(body.model);
      } else {
        if (!body.providerId) {
          return c.json({ error: 'providerId or provider required' }, 400);
        }
        model = registry.getLanguageModel({
          providerId: body.providerId,
          model: body.model,
        });
      }
      const result = await generateText({
        model: model as never,
        prompt: 'Reply with just the word: pong',
      });
      return c.json({ ok: true, text: result.text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: msg }, 500);
    }
  });

  app.post('/api/config/providers/models', async (c) => {
    const body = (await c.req.json()) as {
      providerId?: string;
      provider?: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> };
    };

    let baseUrl: string | undefined;
    let apiKey: string | undefined;
    let headers: Record<string, string> | undefined;

    if (body?.provider) {
      baseUrl = body.provider.baseUrl;
      apiKey = body.provider.apiKey;
      headers = body.provider.headers;
    } else if (body?.providerId) {
      const stored = await loadProviderConfig(body.providerId);
      if (!stored) {
        return c.json({ ok: false, error: `provider not configured: ${body.providerId}` });
      }
      baseUrl = stored.baseUrl;
      apiKey = stored.apiKey;
      headers = stored.headers;
    } else {
      return c.json({ error: 'providerId or provider required' }, 400);
    }

    if (!apiKey) {
      return c.json({ ok: false, error: 'apiKey missing' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await fetch(getModelsEndpoint(baseUrl), {
        method: 'GET',
        headers: {
          ...(headers ?? {}),
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const suffix = errorText ? `: ${errorText}` : '';
        return c.json({ ok: false, error: `models request failed (${response.status})${suffix}` });
      }

      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      const models = Array.from(
        new Set(
          Array.isArray(payload?.data)
            ? payload.data
                .map((entry) => entry?.id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [],
        ),
      ).sort((a, b) => a.localeCompare(b));

      return c.json({ ok: true, models });
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'models request timed out after 8000ms'
          : err instanceof Error
            ? err.message
            : String(err);
      return c.json({ ok: false, error: msg });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  app.get('/api/agents', (c) => {
    const agents = AGENT_ORDER.map((agentId) => {
      const agent = allAgents[agentId] as {
        getDescription?: () => string | undefined;
        getInstructions?: () => string | undefined;
        listTools?: () => Record<string, unknown>;
      };

      return {
        id: agentId,
        label: AGENT_LABELS[agentId],
        description: agent.getDescription?.() ?? '',
        systemPrompt: agent.getInstructions?.() ?? '',
        tools: Object.keys(agent.listTools?.() ?? {}),
      };
    });

    return c.json({ agents });
  });

  app.get('/api/config/agents', async (c) => {
    return c.json({ agents: await loadAgents() });
  });

  app.put('/api/config/agents', async (c) => {
    const body = (await c.req.json()) as { agents: AgentDef[] };
    if (!Array.isArray(body?.agents)) {
      return c.json({ error: 'agents must be an array' }, 400);
    }
    const seen = new Set<string>();
    const builtinIds = new Set(Object.values(BUILTIN_AGENT_IDS));
    const builtinSeen = new Set<string>();
    for (const a of body.agents) {
      if (!a || typeof a.id !== 'string' || !a.id.trim()) {
        return c.json({ error: 'agent.id required' }, 400);
      }
      if (seen.has(a.id)) {
        return c.json({ error: `duplicate agent id: ${a.id}` }, 400);
      }
      seen.add(a.id);
      if (!AGENT_TYPES.includes(a.type)) {
        return c.json({ error: `agent ${a.id}: invalid type ${a.type}` }, 400);
      }
      if (typeof a.label !== 'string' || !a.label.trim()) {
        return c.json({ error: `agent ${a.id}: label required` }, 400);
      }
      if (typeof a.systemPrompt !== 'string' || !a.systemPrompt.trim()) {
        return c.json({ error: `agent ${a.id}: systemPrompt required` }, 400);
      }
      if (typeof a.providerId !== 'string' || !a.providerId.trim()) {
        return c.json({ error: `agent ${a.id}: providerId required` }, 400);
      }
      if (typeof a.model !== 'string' || !a.model.trim()) {
        return c.json({ error: `agent ${a.id}: model required` }, 400);
      }
      if (builtinIds.has(a.id)) {
        builtinSeen.add(a.id);
        if (!a.builtin) {
          return c.json({ error: `agent ${a.id}: builtin flag must be true` }, 400);
        }
      }
    }
    for (const id of builtinIds) {
      if (!builtinSeen.has(id)) {
        return c.json({ error: `builtin agent ${id} cannot be removed` }, 400);
      }
    }
    await saveAgents(body.agents);
    return c.json({ ok: true });
  });

  app.get('/api/config/lineups', async (c) => {
    return c.json({ lineups: await loadLineups() });
  });

  app.put('/api/config/lineups', async (c) => {
    const body = (await c.req.json()) as { lineups: Lineup[] };
    if (!Array.isArray(body?.lineups)) {
      return c.json({ error: 'lineups must be an array' }, 400);
    }
    const existingAgents = await loadAgents();
    const agentById = new Map(existingAgents.map((a) => [a.id, a] as const));
    const seen = new Set<string>();
    for (const l of body.lineups) {
      if (!l || typeof l.id !== 'string' || !l.id.trim()) {
        return c.json({ error: 'lineup.id required' }, 400);
      }
      if (l.id === 'default') {
        return c.json({ error: '"default" lineup id is reserved' }, 400);
      }
      if (seen.has(l.id)) {
        return c.json({ error: `duplicate lineup id: ${l.id}` }, 400);
      }
      seen.add(l.id);
      if (typeof l.label !== 'string' || !l.label.trim()) {
        return c.json({ error: `lineup ${l.id}: label required` }, 400);
      }
      if (!l.agents || typeof l.agents !== 'object') {
        return c.json({ error: `lineup ${l.id}: agents map required` }, 400);
      }
      for (const type of AGENT_TYPES) {
        const agentId = l.agents[type];
        if (typeof agentId !== 'string' || !agentId) {
          return c.json({ error: `lineup ${l.id}: missing agent for type ${type}` }, 400);
        }
        const ref = agentById.get(agentId);
        if (!ref) {
          return c.json({ error: `lineup ${l.id}: agent ${agentId} not found` }, 400);
        }
        if (ref.type !== type) {
          return c.json(
            { error: `lineup ${l.id}: agent ${agentId} type ${ref.type} != slot ${type}` },
            400,
          );
        }
      }
    }
    await saveLineups(body.lineups);
    return c.json({ ok: true });
  });

  app.get('/api/books', async (c) => {
    return c.json({ books: await listBooks() });
  });

  app.post('/api/books', async (c) => {
    const parsed = createBookSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'invalid request body' }, 400);
    }
    try {
      const lineupId = await validateLineupId(parsed.data.lineupId);
      const book = await createBook({ ...parsed.data, lineupId });
      return c.json({ book }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.put('/api/books/:id', async (c) => {
    const parsed = updateBookSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'invalid request body' }, 400);
    }
    try {
      const patch = {
        ...parsed.data,
        lineupId:
          parsed.data.lineupId === undefined ? undefined : await validateLineupId(parsed.data.lineupId),
      };
      const book = await updateBook(c.req.param('id'), patch);
      if (!book) return c.json({ error: 'not found' }, 404);
      return c.json({ book });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 400);
    }
  });

  app.delete('/api/books/:id', async (c) => {
    const deleted = await deleteBook(c.req.param('id'));
    if (!deleted) return c.json({ error: 'not found' }, 404);
    return c.json({ ok: true });
  });

  app.get('/api/books/:id/tree', async (c) => {
    const id = c.req.param('id');
    const book = await getBook(id);
    if (!book) return c.json({ error: 'not found' }, 404);
    const rootIdRaw = c.req.query('rootId');
    const depthRaw = c.req.query('depth');
    const includeArchivedRaw = c.req.query('includeArchived');
    const includeDeletedRaw = c.req.query('includeDeleted');
    const tree = await getDocumentTree(id, {
      rootId: rootIdRaw && rootIdRaw.length > 0 ? rootIdRaw : null,
      depth: depthRaw !== undefined ? Number(depthRaw) : undefined,
      includeArchived: includeArchivedRaw === 'true' || includeArchivedRaw === '1',
      includeDeleted: includeDeletedRaw === 'true' || includeDeletedRaw === '1',
    });
    return c.json({ book, tree });
  });

  app.get('/api/documents/:id', async (c) => {
    const doc = await getDocument(c.req.param('id'));
    if (!doc) return c.json({ error: 'not found' }, 404);
    return c.json({ document: doc });
  });

  app.post('/api/documents/:id/archive', async (c) => {
    const id = c.req.param('id');
    const doc = await archiveDocument(id);
    if (!doc) return c.json({ error: 'not found' }, 404);
    return c.json({ document: doc });
  });

  app.post('/api/documents/:id/restore', async (c) => {
    const id = c.req.param('id');
    const doc = await restoreDocument(id);
    if (!doc) return c.json({ error: 'not found' }, 404);
    return c.json({ document: doc });
  });

  app.delete('/api/documents/:id', async (c) => {
    const id = c.req.param('id');
    const doc = await deleteDocument(id);
    if (!doc) return c.json({ error: 'not found' }, 404);
    return c.json({ document: doc });
  });

  app.post('/api/documents/:id/purge', async (c) => {
    const id = c.req.param('id');
    const ok = await purgeDocument(id);
    if (!ok) return c.json({ error: 'not found' }, 404);
    return c.json({ purged: true });
  });

  app.get('/api/threads', async (c) => {
    const bookId = c.req.query('bookId')?.trim();
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const memory = getMastraMemory();
    const result = await memory.listThreads({
      filter: { resourceId: bookId },
      perPage: false,
      orderBy: { field: 'updatedAt', direction: 'DESC' },
    });
    return c.json({ threads: result.threads });
  });

  app.post('/api/threads', async (c) => {
    const body = (await c.req.json()) as { bookId?: unknown; title?: unknown; agentId?: unknown };
    const bookId =
      typeof body.bookId === 'string' && body.bookId.trim() ? body.bookId.trim() : undefined;
    if (!bookId) return c.json({ error: '缺少 bookId' }, 400);
    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '新会话';
    const requestedAgentId =
      typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : 'supervisor';
    if (!AGENT_ORDER.includes(requestedAgentId as AgentMetadataId)) {
      return c.json({ error: `invalid agentId: ${requestedAgentId}` }, 400);
    }
    const memory = getMastraMemory();
    const thread = await memory.createThread({
      resourceId: bookId,
      title,
      metadata: { agentId: requestedAgentId },
    });
    return c.json({ thread });
  });

  app.patch('/api/threads/:id', async (c) => {
    const id = c.req.param('id');
    const body = (await c.req.json()) as { title?: unknown };
    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
    if (!title) return c.json({ error: 'title 必填' }, 400);
    const memory = getMastraMemory();
    const existing = await memory.getThreadById({ threadId: id });
    if (!existing) return c.json({ error: 'not found' }, 404);
    const saved = await memory.saveThread({
      thread: { ...existing, title, updatedAt: new Date() },
    });
    return c.json({ thread: saved });
  });

  app.get('/api/threads/:id/messages', async (c) => {
    const id = c.req.param('id');
    const memory = getMastraMemory();
    const existing = await memory.getThreadById({ threadId: id });
    if (!existing) return c.json({ error: 'not found' }, 404);
    const result = await memory.recall({
      threadId: id,
      perPage: false,
      orderBy: { field: 'createdAt', direction: 'ASC' },
    });
    const uiMessages = convertMessages(result.messages).to('AIV5.UI');
    return c.json({ messages: uiMessages });
  });

  app.delete('/api/threads/:id', async (c) => {
    const id = c.req.param('id');
    const memory = getMastraMemory();
    const existing = await memory.getThreadById({ threadId: id });
    if (!existing) return c.json({ error: 'not found' }, 404);
    await memory.deleteThread(id);
    return c.json({ ok: true });
  });

  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
    process.stdout.write(`READY:${info.port}\n`);
  });

  const shutdown = (signal: string) => {
    process.stderr.write(`[mastra] received ${signal}, shutting down\n`);
    try {
      server.close();
    } catch {}
    try {
      closeFtsDb();
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  process.stderr.write(`[mastra] fatal: ${err?.stack ?? String(err)}\n`);
  process.exit(1);
});
