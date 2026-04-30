import type { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type { SubagentType, RuntimeSubagents } from '../agents/subagents.ts';
import {
  readBookIdFromContext,
  readParentThreadIdFromContext,
  type AppRequestContextValues,
} from '../shared/request-context.ts';
import { getMastraMemory } from '../db/mastra-store.ts';

const SUBAGENT_IDS: SubagentType[] = ['architect', 'chronicler', 'editor', 'loreKeeper'];

const SUBAGENT_LABELS: Record<SubagentType, string> = {
  architect: '架构师',
  chronicler: '执笔者',
  editor: '润色师',
  loreKeeper: '设定守护者',
};

function buildSubThreadTitle(agentId: SubagentType, task: string): string {
  const head = task.replace(/\s+/g, ' ').trim().slice(0, 40);
  const suffix = task.length > 40 ? '…' : '';
  return `${SUBAGENT_LABELS[agentId]} · ${head}${suffix}`;
}

export function createDelegateToAgentTool(subagents: RuntimeSubagents) {
  return createTool({
    id: 'delegateToAgent',
    description: [
      '把一个具体子任务派给一个专业子智能体（architect / chronicler / editor / loreKeeper），',
      '系统会为本次委派自动新建一个子对话线程（用户可在左侧侧边栏点击查看子智能体的完整对话），',
      '并同步等待子智能体完成后把它的最终中文回复返回给你。',
      '',
      '调用规则：',
      '- agentId 必须是下列之一：architect（结构/大纲，以及人物/设定/世界观/地点/势力/时间线 等设定层文档的创建与修改）、chronicler（撰写正文）、editor（润色改写）、loreKeeper（仅一致性核查，不创建新设定）。',
      '- task 字段写给子智能体的完整指令（中文，自然语言），要包含明确产出要求；不要写"请你帮我做某事"这种空话。',
      '- context 字段（可选）填本任务相关的背景：当前书 id、相关章节摘要、限制条件等。子智能体看不到主对话历史，必要信息必须显式传过去。',
      '- 一次调用只委派一个 agent，一个任务。需要多个 agent 协作时连续多次调用本工具。',
      '',
      '返回：threadId（子对话 id，可在 UI 显示链接）+ agentId + text（子智能体的最终回复，中文）。',
      '拿到结果后请用一句简短中文向用户汇报：哪个子智能体做了什么、产出是什么。',
    ].join('\n'),
    inputSchema: z.object({
      agentId: z.enum(SUBAGENT_IDS as [SubagentType, ...SubagentType[]]),
      task: z.string().min(1, 'task 不能为空'),
      context: z.string().optional(),
    }),
    outputSchema: z.object({
      threadId: z.string(),
      agentId: z.string(),
      text: z.string(),
    }),
    execute: async (input, ctx) => {
      const { agentId, task, context: extraContext } = input;
      const bookId = readBookIdFromContext(ctx);
      if (!bookId) {
        throw new Error('delegateToAgent 失败：当前没有选中任何书（bookId 缺失）');
      }
      const parentThreadId = readParentThreadIdFromContext(ctx);
      const targetAgent: Agent | undefined = subagents[agentId as SubagentType];
      if (!targetAgent) {
        throw new Error(`delegateToAgent 失败：未知 agentId=${agentId}`);
      }

      const memory = getMastraMemory();
      const subThread = await memory.createThread({
        resourceId: bookId,
        title: buildSubThreadTitle(agentId as SubagentType, task),
        metadata: {
          agentId,
          ...(parentThreadId ? { parentThreadId } : {}),
          delegated: true,
        },
      });

      const messageBody = extraContext?.trim()
        ? `【背景】\n${extraContext.trim()}\n\n【任务】\n${task.trim()}`
        : task.trim();

      const subRequestContext = new RequestContext<AppRequestContextValues>([
        ['bookId', bookId],
        ['parentThreadId', subThread.id],
      ]);

      const result = await targetAgent.generate(
        [{ role: 'user', content: messageBody }],
        {
          memory: { thread: subThread.id, resource: bookId },
          requestContext: subRequestContext,
          maxSteps: 16,
        },
      );

      const text = typeof result?.text === 'string' && result.text.trim()
        ? result.text
        : `（${SUBAGENT_LABELS[agentId as SubagentType]} 未返回文本结果）`;

      return {
        threadId: subThread.id,
        agentId,
        text,
      };
    },
  });
}
