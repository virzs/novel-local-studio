import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getMemory } from '../mastra.js';

export const conversationsRouter = new Hono();

conversationsRouter.get('/conversations', async (c) => {
  const agentId = c.req.query('agentId');
  const projectId = c.req.query('projectId');
  const memory = getMemory();

  const filter: { resourceId?: string; metadata?: Record<string, unknown> } = {};
  if (projectId) {
    filter.metadata = { projectId };
  } else if (agentId) {
    filter.resourceId = agentId;
  }

  const result = await memory.listThreads({ filter });
  const threads = result.threads ?? [];
  return c.json({ conversations: threads });
});

conversationsRouter.post('/conversations', async (c) => {
  const body = await c.req.json<{ id?: string; title?: string; agentId?: string; projectId?: string }>();
  const threadId = body.id ?? randomUUID();
  const agentId = body.agentId ?? 'novel-writing-agent';
  const title = body.title?.trim() || '新对话';
  const metadata: Record<string, unknown> = {};
  if (body.projectId) metadata.projectId = body.projectId;

  const memory = getMemory();
  const thread = await memory.saveThread({
    thread: {
      id: threadId,
      resourceId: agentId,
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata,
    },
  });
  return c.json(thread, 201);
});

conversationsRouter.get('/conversations/:id', async (c) => {
  const threadId = c.req.param('id');
  const memory = getMemory();
  const thread = await memory.getThreadById({ threadId });
  if (!thread) return c.json({ error: 'Conversation not found' }, 404);
  const msgResult = await memory.recall({ threadId, perPage: false });
  const messages = msgResult.messages ?? [];
  return c.json({ ...thread, messages });
});

conversationsRouter.put('/conversations/:id', async (c) => {
  const threadId = c.req.param('id');
  const body = await c.req.json<{ title?: string; projectId?: string }>();
  const memory = getMemory();
  const existing = await memory.getThreadById({ threadId });
  if (!existing) return c.json({ error: 'Conversation not found' }, 404);

  const metadata = { ...(existing.metadata ?? {}) };
  if (body.projectId !== undefined) metadata.projectId = body.projectId;

  const updated = await memory.updateThread({
    id: threadId,
    title: body.title ?? existing.title ?? '',
    metadata,
  });
  return c.json(updated);
});

conversationsRouter.delete('/conversations/:id', async (c) => {
  const threadId = c.req.param('id');
  const memory = getMemory();
  const existing = await memory.getThreadById({ threadId });
  if (!existing) return c.json({ error: 'Conversation not found' }, 404);
  await memory.deleteThread(threadId);
  return c.json({ deleted: threadId });
});
