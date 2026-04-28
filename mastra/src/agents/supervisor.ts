import { Agent } from '@mastra/core/agent';
import { registry } from '../llm/providers.ts';
import { getBuiltinAgent } from './agents-cache.ts';
import type { AgentDef } from '../llm/bindings.ts';
import { createSubagents, type AgentDefResolver, type RuntimeSubagents } from './subagents.ts';
import { allDocumentTools } from '../tools/documents.ts';
import { searchTools } from '../tools/search.ts';
import { getBook } from '../db/books.ts';
import { getMastraMemory } from '../db/mastra-store.ts';

const defaultAgentDefResolver: AgentDefResolver = (type) => getBuiltinAgent(type);

const defaultSupervisorDescription =
  'Top-level orchestrator. Delegates to specialized sub-agents (architect, chronicler, editor, loreKeeper) and synthesizes their output.';

function getSupervisorDef(resolveAgentDef: AgentDefResolver): AgentDef {
  return resolveAgentDef('supervisor');
}

async function buildActiveBookSection(requestContext: unknown): Promise<string> {
  const rc = requestContext as { get?: (k: string) => unknown } | undefined;
  const bookId = typeof rc?.get === 'function' ? rc.get('bookId') : undefined;
  if (typeof bookId !== 'string' || !bookId) {
    return [
      '\n\n## 当前工作上下文',
      '用户尚未在左侧选中任何书。需要操作书内文档前，先用 listBooks 让用户确认目标书。',
    ].join('\n');
  }
  try {
    const book = await getBook(bookId);
    if (!book) {
      return [
        '\n\n## 当前工作上下文',
        `请求声称当前书 id=${bookId}，但数据库未找到该书。请用 listBooks 让用户重新确认。`,
      ].join('\n');
    }
    const synopsis = book.synopsis?.trim() ? book.synopsis.trim() : '（未填写简介）';
    return [
      '\n\n## 当前工作上下文',
      `用户当前正在编辑的书：**《${book.title}》**（id=${book.id}，状态=${book.status}）`,
      `简介：${synopsis}`,
      '',
      '默认所有问题、检索、文档操作都围绕这本书进行：',
      '- 调用 getDocumentTree / createDocument 时无需传 bookId，省略即默认本书',
      '- 调用 searchDocuments 时同理，bookId 留空即只检索本书；用户明确要求跨书时传 bookId="*"',
      '- 用户提到"这本书 / 当前 / 它"等代词时，一律指上述这本书',
      '- 仅当用户显式提到其他书名或要求"列出所有书"时，才使用 listBooks',
    ].join('\n');
  } catch {
    return '';
  }
}

export function createSupervisorAgent(
  resolveAgentDef: AgentDefResolver = defaultAgentDefResolver,
  subagents: RuntimeSubagents = createSubagents(resolveAgentDef),
): Agent {
  return new Agent({
    id: 'supervisor',
    name: 'Supervisor',
    description: defaultSupervisorDescription,
    instructions: async ({ requestContext }) => {
      const base = getSupervisorDef(resolveAgentDef).systemPrompt;
      const ctxBlock = await buildActiveBookSection(requestContext);
      return `${base}${ctxBlock}`;
    },
    model: () => registry.getLanguageModel(getSupervisorDef(resolveAgentDef)),
    agents: subagents,
    tools: { ...allDocumentTools, ...searchTools },
    memory: getMastraMemory(),
  });
}

export const supervisor = createSupervisorAgent();

