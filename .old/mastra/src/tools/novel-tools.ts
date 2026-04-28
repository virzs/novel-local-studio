import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { getDb } from '../db/db.js';
import { worldSettings, worldSettingTypes, chapters, projects, outlines } from '../db/schema.js';
import { initializeProjectWorld } from '../lib/project-world-init.js';

function now(): number {
  return Date.now();
}

function getProjectId(context: { requestContext?: RequestContext }): string | null {
  const rc = context.requestContext;
  if (!rc) return null;
  return (rc.get('bookId') as string) ?? (rc.get('projectId') as string) ?? null;
}

function getTypeIdFromContext(context: { requestContext?: RequestContext }): string | undefined {
  return context.requestContext?.get('typeId') as string | undefined;
}

// ─── World Setting Tools ─────────────────────────────────────────────────────

export const createWorldSettingTool = createTool({
  id: 'createWorldSetting',
  description: '在世界设定数据库中创建一条新的世界设定条目。调用此工具后设定将立即持久化，页面会自动刷新显示。',
  inputSchema: z.object({
    typeId: z.string().optional().describe('世界设定分类ID（如 wst-world--<projectId>）。若未提供则使用当前页面分类。'),
    title: z.string().describe('设定条目标题，简短有力，如"极北冰原"、"灵气潮汐规律"'),
    summary: z.string().optional().describe('一句话摘要，用于快速上下文注入（50字以内）'),
    content: z.string().describe('完整的设定内容（Markdown格式），尽可能详细'),
    tags: z.string().optional().describe('标签列表，JSON字符串数组，如 ["地理","环境"]'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    title: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const typeId = input.typeId ?? getTypeIdFromContext(context);
    if (!typeId) return { error: 'typeId missing — provide typeId arg or set page context' };

    const [type] = await db.select().from(worldSettingTypes)
      .where(and(eq(worldSettingTypes.id, typeId), eq(worldSettingTypes.projectId, projectId)));
    if (!type) return { error: `worldSettingType ${typeId} not found for project ${projectId}` };

    const row = {
      id: randomUUID(),
      projectId,
      typeId,
      title: input.title,
      summary: input.summary ?? null,
      content: input.content,
      tags: input.tags ?? '[]',
      sortOrder: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.insert(worldSettings).values(row);
    return { success: true, id: row.id, title: row.title };
  },
});

export const updateWorldSettingTool = createTool({
  id: 'updateWorldSetting',
  description: '更新已有的世界设定条目内容。需要提供设定的ID。',
  inputSchema: z.object({
    id: z.string().describe('要更新的世界设定条目ID'),
    title: z.string().optional().describe('新标题'),
    summary: z.string().optional().describe('新摘要'),
    content: z.string().optional().describe('新的完整内容（Markdown格式）'),
    tags: z.string().optional().describe('新标签列表，JSON字符串数组'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    updated: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    const db = getDb();
    const [existing] = await db.select().from(worldSettings).where(eq(worldSettings.id, input.id));
    if (!existing) return { error: `worldSetting ${input.id} not found` };

    const updates: Partial<typeof existing> & { updatedAt: number } = { updatedAt: now() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.content !== undefined) updates.content = input.content;
    if (input.tags !== undefined) updates.tags = input.tags;

    await db.update(worldSettings).set(updates).where(eq(worldSettings.id, input.id));
    return { success: true, id: input.id, updated: Object.keys(updates).filter(k => k !== 'updatedAt') };
  },
});

export const listWorldSettingsTool = createTool({
  id: 'listWorldSettings',
  description: '列出当前项目某分类下的所有世界设定条目，用于了解已有设定再决定新增还是更新。',
  inputSchema: z.object({
    typeId: z.string().optional().describe('世界设定分类ID。留空则列出项目下所有设定。'),
  }),
  outputSchema: z.object({
    settings: z.array(z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string().nullable(),
      typeId: z.string(),
    })).optional(),
    count: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const typeId = input.typeId ?? getTypeIdFromContext(context);
    const conditions = typeId
      ? and(eq(worldSettings.projectId, projectId), eq(worldSettings.typeId, typeId))
      : eq(worldSettings.projectId, projectId);

    const rows = await db.select({
      id: worldSettings.id,
      title: worldSettings.title,
      summary: worldSettings.summary,
      typeId: worldSettings.typeId,
    }).from(worldSettings).where(conditions).orderBy(worldSettings.sortOrder);

    return { settings: rows, count: rows.length };
  },
});

// ─── Project Tools ───────────────────────────────────────────────────────────

export const createProjectTool = createTool({
  id: 'createProject',
  description: '创建一部新书籍/小说项目并立即持久化到数据库。用于「AI 对话创建」流程——当用户描述了故事构想后，调用此工具直接生成项目记录，无需用户手动填写表单。调用成功后页面书架会自动刷新显示新书籍。',
  inputSchema: z.object({
    name: z.string().describe('书名，简短有力，1-20 字'),
    synopsis: z.string().optional().describe('故事简介，100-300 字，概括核心冲突与人物'),
    genre: z.string().optional().describe('小说类型，如"玄幻"、"都市"、"科幻"、"悬疑"、"历史"等'),
    status: z.enum(['drafting', 'writing', 'revising', 'completed', 'archived']).optional().describe('项目状态'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    const db = getDb();
    const existing = await db.select().from(projects).where(eq(projects.name, input.name)).limit(1);
    if (existing.length > 0) {
      return { success: true, id: existing[0].id, name: existing[0].name, status: existing[0].status };
    }
    const row = {
      id: randomUUID(),
      name: input.name,
      synopsis: input.synopsis ?? null,
      genre: input.genre ?? null,
      status: input.status ?? 'drafting',
      archived: 0,
      worldInitStatus: 'idle',
      worldInitError: null,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.insert(projects).values(row);
    void initializeProjectWorld(row.id).catch((err) => {
      console.error(`[tools.createProject] failed to auto-initialize world for ${row.id}:`, err);
    });
    return { success: true, id: row.id, name: row.name, status: row.status };
  },
});

// ─── Chapter Tools ────────────────────────────────────────────────────────────

export const createChapterTool = createTool({
  id: 'createChapter',
  description: '创建一个新章节并写入内容。调用后章节立即持久化到数据库。',
  inputSchema: z.object({
    title: z.string().describe('章节标题，如"第一章 初入江湖"'),
    content: z.string().optional().describe('章节正文内容（Markdown格式）'),
    order: z.string().optional().describe('章节顺序编号（数字字符串），默认自动排在最后'),
    status: z.enum(['draft', 'review', 'done']).optional().describe('章节状态'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    title: z.string().optional(),
    wordCount: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const existingChapters = await db.select({ order: chapters.order })
      .from(chapters).where(eq(chapters.projectId, projectId));
    const maxOrder = existingChapters.reduce((max, c) => Math.max(max, c.order), -1);

    const content = input.content ?? '';
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    const row = {
      id: randomUUID(),
      projectId,
      title: input.title,
      content,
      order: input.order !== undefined ? Number(input.order) : maxOrder + 1,
      status: input.status ?? 'draft',
      wordCount,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.insert(chapters).values(row);
    return { success: true, id: row.id, title: row.title, wordCount };
  },
});

export const updateChapterTool = createTool({
  id: 'updateChapter',
  description: '更新已有章节的标题或正文内容。',
  inputSchema: z.object({
    id: z.string().describe('要更新的章节ID'),
    title: z.string().optional().describe('新标题'),
    content: z.string().optional().describe('新正文内容'),
    status: z.enum(['draft', 'review', 'done']).optional().describe('新状态'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    updated: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    const db = getDb();
    const [existing] = await db.select().from(chapters).where(eq(chapters.id, input.id));
    if (!existing) return { error: `chapter ${input.id} not found` };

    const updates: Partial<typeof existing> & { updatedAt: number } = { updatedAt: now() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.content !== undefined) {
      updates.content = input.content;
      updates.wordCount = input.content.trim().split(/\s+/).filter(Boolean).length;
    }
    if (input.status !== undefined) updates.status = input.status;

    await db.update(chapters).set(updates).where(eq(chapters.id, input.id));
    return { success: true, id: input.id, updated: Object.keys(updates).filter(k => k !== 'updatedAt') };
  },
});

export const listChaptersTool = createTool({
  id: 'listChapters',
  description: '列出当前项目的所有章节概要（不含正文），用于了解章节结构。',
  inputSchema: z.object({}),
  outputSchema: z.object({
    chapters: z.array(z.object({
      id: z.string(),
      title: z.string(),
      order: z.number(),
      status: z.string(),
      wordCount: z.number(),
    })).optional(),
    count: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (_input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const rows = await db.select({
      id: chapters.id,
      title: chapters.title,
      order: chapters.order,
      status: chapters.status,
      wordCount: chapters.wordCount,
    }).from(chapters).where(eq(chapters.projectId, projectId))
      .orderBy(chapters.order);

    return { chapters: rows, count: rows.length };
  },
});

// ─── Outline Tools ────────────────────────────────────────────────────────────

export const createOutlineTool = createTool({
  id: 'createOutline',
  description: '在大纲数据库中创建一个新节点（卷或章节大纲）。卷(volume)是顶层节点，章节(chapter)节点需指定parentId（卷的ID）。调用后立即持久化。',
  inputSchema: z.object({
    title: z.string().describe('节点标题，如"第一卷 初出茅庐"或"第一章 少年出山"'),
    description: z.string().optional().describe('该节点的大纲内容/剧情概要（Markdown格式）'),
    type: z.enum(['volume', 'chapter']).default('chapter').describe('节点类型：volume=卷，chapter=章节大纲节点'),
    parentId: z.string().optional().describe('父节点ID（章节节点必填，填入所属卷的ID）'),
    order: z.coerce.number().optional().describe('排列顺序，默认追加到末尾'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    title: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    if (input.type === 'chapter' && !input.parentId) {
      return { error: 'parentId is required for chapter nodes — provide the volume ID' };
    }

    const siblings = await db
      .select({ order: outlines.order })
      .from(outlines)
      .where(
        input.parentId
          ? and(eq(outlines.projectId, projectId), eq(outlines.parentId, input.parentId))
          : and(eq(outlines.projectId, projectId), eq(outlines.type, 'volume')),
      );
    const maxOrder = siblings.reduce((max, r) => Math.max(max, r.order), -1);

    const row = {
      id: randomUUID(),
      projectId,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      order: input.order ?? maxOrder + 1,
      status: 'draft' as const,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.insert(outlines).values(row);
    return { success: true, id: row.id, title: row.title };
  },
});

export const updateOutlineTool = createTool({
  id: 'updateOutline',
  description: '更新已有大纲节点的标题、描述或状态。',
  inputSchema: z.object({
    id: z.string().describe('要更新的大纲节点ID'),
    title: z.string().optional().describe('新标题'),
    description: z.string().optional().describe('新大纲内容/剧情概要'),
    status: z.enum(['draft', 'done']).optional().describe('节点状态：draft=草稿，done=已完成'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    updated: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (input) => {
    const db = getDb();
    const [existing] = await db.select().from(outlines).where(eq(outlines.id, input.id));
    if (!existing) return { error: `outline node ${input.id} not found` };

    const updates: Partial<typeof existing> & { updatedAt: number } = { updatedAt: now() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;

    await db.update(outlines).set(updates).where(eq(outlines.id, input.id));
    return { success: true, id: input.id, updated: Object.keys(updates).filter(k => k !== 'updatedAt') };
  },
});

export const listOutlinesTool = createTool({
  id: 'listOutlines',
  description: '列出当前项目的完整大纲结构（所有卷和章节大纲节点），用于了解故事结构再决定新增或修改。',
  inputSchema: z.object({}),
  outputSchema: z.object({
    outlines: z.array(z.object({
      id: z.string(),
      parentId: z.string().nullable(),
      title: z.string(),
      description: z.string().nullable(),
      type: z.string(),
      order: z.number(),
      status: z.string(),
    })).optional(),
    count: z.number().optional(),
    error: z.string().optional(),
  }),
  execute: async (_input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const rows = await db
      .select({
        id: outlines.id,
        parentId: outlines.parentId,
        title: outlines.title,
        description: outlines.description,
        type: outlines.type,
        order: outlines.order,
        status: outlines.status,
      })
      .from(outlines)
      .where(eq(outlines.projectId, projectId))
      .orderBy(outlines.order);

    return { outlines: rows, count: rows.length };
  },
});

export const createWorldSettingTypeTool = createTool({
  id: 'createWorldSettingType',
  description: '为当前项目创建一个新的世界设定分类（如"等级体系"、"特殊种族"等）。创建后可用 createWorldSetting 在该分类下新建设定条目。',
  inputSchema: z.object({
    name: z.string().describe('分类名称，如"修炼等级"、"特殊种族"'),
    icon: z.string().optional().describe('分类图标（Emoji），默认为📖'),
    description: z.string().optional().describe('简短说明这个分类存放什么内容'),
  }),
  outputSchema: z.object({
    success: z.boolean().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const row = {
      id: randomUUID(),
      projectId,
      name: input.name,
      icon: input.icon ?? '📖',
      description: input.description ?? null,
      isPreset: 0 as const,
      sortOrder: 50,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.insert(worldSettingTypes).values(row);
    return { success: true, id: row.id, name: row.name };
  },
});

export const updateChaptersBySettingTool = createTool({
  id: 'updateChaptersBySetting',
  description: '根据世界设定的变化，批量更新相关章节内容，使其与最新设定保持一致。先用 listChapters 了解章节列表，再按指令逐一调用 updateChapter 修改内容。',
  inputSchema: z.object({
    settingId: z.string().describe('发生变化的世界设定条目ID'),
    chapterIds: z.array(z.string()).optional().describe('需要更新的章节ID列表；不填则更新所有章节'),
    instruction: z.string().describe('如何根据新设定修改章节内容的具体说明'),
  }),
  outputSchema: z.object({
    updatedChapterIds: z.array(z.string()).optional(),
    skippedChapterIds: z.array(z.string()).optional(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const db = getDb();
    const projectId = getProjectId(context);
    if (!projectId) return { error: 'projectId missing from context' };

    const [setting] = await db.select().from(worldSettings).where(eq(worldSettings.id, input.settingId));
    if (!setting) return { error: `worldSetting ${input.settingId} not found` };

    const allChapters = await db
      .select({ id: chapters.id, title: chapters.title, content: chapters.content })
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.order);

    const targets = input.chapterIds
      ? allChapters.filter((ch) => input.chapterIds!.includes(ch.id))
      : allChapters;

    const updatedChapterIds: string[] = [];
    const skippedChapterIds: string[] = [];

    for (const chapter of targets) {
      const needsUpdate = chapter.content && chapter.content.length > 0;
      if (!needsUpdate) { skippedChapterIds.push(chapter.id); continue; }
      updatedChapterIds.push(chapter.id);
    }

    return {
      updatedChapterIds,
      skippedChapterIds,
    };
  },
});

// ─── Tool Registry ───────────────────────────────────────────────────────────

export const ALL_TOOLS = {
  createProject: createProjectTool,
  createWorldSetting: createWorldSettingTool,
  updateWorldSetting: updateWorldSettingTool,
  listWorldSettings: listWorldSettingsTool,
  createWorldSettingType: createWorldSettingTypeTool,
  createChapter: createChapterTool,
  updateChapter: updateChapterTool,
  listChapters: listChaptersTool,
  createOutline: createOutlineTool,
  updateOutline: updateOutlineTool,
  listOutlines: listOutlinesTool,
  updateChaptersBySetting: updateChaptersBySettingTool,
} as const;

export type ToolName = keyof typeof ALL_TOOLS;

const AGENT_TOOL_MAP: Record<string, ToolName[]> = {
  'preset-director': [
    'createProject',
    'createWorldSetting', 'updateWorldSetting', 'listWorldSettings', 'createWorldSettingType',
    'createChapter', 'updateChapter', 'listChapters',
    'createOutline', 'updateOutline', 'listOutlines',
    'updateChaptersBySetting',
  ],
  'preset-worldbuilder': ['createWorldSetting', 'updateWorldSetting', 'listWorldSettings', 'createWorldSettingType', 'listOutlines', 'updateChaptersBySetting'],
  'preset-character-designer': ['createWorldSetting', 'updateWorldSetting', 'listWorldSettings', 'listOutlines'],
  'preset-outline-planner': ['createOutline', 'updateOutline', 'listOutlines', 'listChapters', 'listWorldSettings'],
  'preset-chapter-planner': ['createChapter', 'listChapters', 'listOutlines', 'listWorldSettings'],
  'preset-writer': ['createChapter', 'updateChapter', 'listChapters', 'listOutlines', 'listWorldSettings', 'updateWorldSetting'],
  'preset-dialogue': ['listChapters', 'listWorldSettings'],
  'preset-polisher': ['listChapters', 'updateChapter'],
  'preset-reviewer': ['listChapters', 'listWorldSettings', 'listOutlines'],
  'preset-reader-feedback': ['listChapters'],
};

export function getToolsForAgent(agentId: string): Record<string, typeof ALL_TOOLS[ToolName]> {
  const allowedNames = AGENT_TOOL_MAP[agentId];
  if (!allowedNames) return { ...ALL_TOOLS };

  const result: Record<string, typeof ALL_TOOLS[ToolName]> = {};
  for (const name of allowedNames) {
    result[name] = ALL_TOOLS[name];
  }
  return result;
}
