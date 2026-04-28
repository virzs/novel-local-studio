import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { RequestContext } from '@mastra/core/request-context';
import { handleChatStream, toAISdkStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import type { HonoBindings, HonoVariables } from '@mastra/hono';
import { getDb } from '../db/db.js';
import { agents as agentsTable } from '../db/schema.js';
import { getMastra, buildDynamicAgent, getMemory } from '../mastra.js';

interface ChatRequestBody {
  messages?: Array<Record<string, unknown>>;
  threadId?: string;
  context?: Record<string, unknown>;
  model?: string;
  provider?: string;
  memory?: { thread?: string; resource?: string };
  data?: Record<string, unknown>;
  autoMode?: boolean;
}

export const chatRouter = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

chatRouter.post('/chat/:agentId', async (c) => {
  const agentId = c.req.param('agentId');
  const body = await c.req.json<ChatRequestBody>();

  const messages = body.messages ?? [];
  const threadId = body.memory?.thread ?? body.threadId;
  const memoryResourceId = body.memory?.resource ?? agentId;
  const context = body.data ?? body.context;

  const requestContext = c.get('requestContext') ?? new RequestContext();
  requestContext.set('agentId', agentId);
  if (context?.bookId) requestContext.set('bookId', context.bookId);
  if (context?.projectId) requestContext.set('projectId', context.projectId);
  if (context?.typeId) requestContext.set('typeId', context.typeId);
  if (context) requestContext.set('context', context);
  if (body.model) requestContext.set('model', body.model);

  const mastra = c.get('mastra') ?? getMastra();

  let isPreset = false;
  try {
    mastra.getAgentById(agentId);
    isPreset = true;
  } catch {
  }

  if (isPreset) {
    const hasBookId = !!(context?.bookId);
    const maxSteps = (agentId === 'preset-director' && !hasBookId) ? 1 : 25;
    const autoMode = body.autoMode !== false;

    const stream = await (handleChatStream as Function)({
      mastra,
      agentId,
      params: {
        messages,
        requestContext,
      },
      defaultOptions: {
        memory: threadId ? { thread: threadId, resource: memoryResourceId } : undefined,
        maxSteps,
        onIterationComplete: autoMode ? undefined : () => ({ continue: false }),
      },
      version: 'v6',
      sendStart: true,
      sendFinish: true,
    });
    return createUIMessageStreamResponse({ stream });
  }

  const db = getDb();
  const [dbAgent] = await db.select().from(agentsTable).where(eq(agentsTable.id, agentId)).limit(1);
  if (!dbAgent) {
    return c.json({ error: `Agent "${agentId}" not found` }, 404);
  }

  const agent = buildDynamicAgent(
    {
      id: dbAgent.id,
      name: dbAgent.name,
      systemPrompt: dbAgent.systemPrompt,
      model: dbAgent.model,
      provider: dbAgent.provider,
    },
    getMemory(),
  );

  const memoryOption = threadId
    ? { thread: threadId, resource: memoryResourceId }
    : undefined;

  const result = await agent.stream(messages as Parameters<typeof agent.stream>[0], {
    requestContext,
    memory: memoryOption,
    maxSteps: 25,
    abortSignal: c.req.raw.signal,
  });

  const uiStream = (toAISdkStream as Function)(result, {
    from: 'agent',
    version: 'v6',
    sendStart: true,
    sendFinish: true,
  });

  return createUIMessageStreamResponse({ stream: uiStream });
});
