import { Agent } from '@mastra/core/agent';
import { registry } from '../llm/providers.ts';
import { getBuiltinAgent } from './agents-cache.ts';
import type { AgentDef } from '../llm/bindings.ts';
import type { AgentDefResolver, RuntimeSubagents } from './subagents.ts';
import { readOnlyDocumentTools } from '../tools/documents.ts';
import { searchTools } from '../tools/search.ts';
import { createDelegateToAgentTool } from '../tools/delegate.ts';
import { getBook } from '../db/books.ts';
import { getMastraMemory } from '../db/mastra-store.ts';

const defaultAgentDefResolver: AgentDefResolver = (type) => getBuiltinAgent(type);

const defaultSupervisorDescription =
  'Top-level orchestrator. Delegates concrete writing/editing/world-building work to specialized sub-agents (architect / chronicler / editor / loreKeeper) via the delegateToAgent tool, which auto-creates a sub-conversation thread the user can open in the sidebar.';

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
      '- 调用 getDocumentTree 时无需传 bookId，省略即默认本书',
      '- 调用 searchDocuments 时同理，bookId 留空即只检索本书；用户明确要求跨书时传 bookId="*"',
      '- 用户提到"这本书 / 当前 / 它"等代词时，一律指上述这本书',
      '- 仅当用户显式提到其他书名或要求"列出所有书"时，才使用 listBooks',
      '',
      '**写操作必须 delegateToAgent**：',
      '- 创建/修改 大纲 / 章节骨架 / 卷幕结构 / 情节节奏 / 人物档 / 设定 / 世界观 / 地点 / 势力 / 时间线 → delegateToAgent(agentId="architect", task=...)',
      '- 撰写 / 扩写 正文 / 场景 / 对白 → delegateToAgent(agentId="chronicler", task=...)',
      '- 润色 / 改写 / 调整语气 / 修正连贯性（不改剧情） → delegateToAgent(agentId="editor", task=...)',
      '- 一致性核查（检查人名/时间线/地点/规则是否冲突，必要时小修一致性字段） → delegateToAgent(agentId="loreKeeper", task=...)',
      '- 默认流程：用户要求"创建/新增/补充设定 或 人物"时，仅派 architect。**不要**自动追加 loreKeeper 一致性核查；只有用户明确要求"检查/校对/对比一致性"时才派 loreKeeper。',
      '- 你自己**没有 createDocument/updateDocument/deleteDocument 工具**，所有写操作必须经 delegateToAgent。',
    ].join('\n');
  } catch {
    return '';
  }
}

export function createSupervisorAgent(
  resolveAgentDef: AgentDefResolver = defaultAgentDefResolver,
  subagents?: RuntimeSubagents,
): Agent {
  const baseTools = {
    ...readOnlyDocumentTools,
    ...searchTools,
  };
  const tools = subagents
    ? { ...baseTools, delegateToAgent: createDelegateToAgentTool(subagents) }
    : baseTools;
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
    tools,
    memory: () => getMastraMemory(),
  });
}

export const supervisor = createSupervisorAgent();
