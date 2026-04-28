import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { RequestContext } from '@mastra/core/request-context';
import { getDb } from '../db/db.js';
import { projects, worldSettingTypes } from '../db/schema.js';
import { getMastra } from '../mastra.js';

function now(): number {
  return Date.now();
}

async function setProjectWorldInitState(
  projectId: string,
  worldInitStatus: 'idle' | 'running' | 'ready' | 'failed',
  worldInitError: string | null,
): Promise<void> {
  const db = getDb();
  await db.update(projects)
    .set({ worldInitStatus, worldInitError, updatedAt: now() })
    .where(eq(projects.id, projectId));
}

async function ensureCharacterType(projectId: string): Promise<void> {
  const db = getDb();
  const existing = await db.select().from(worldSettingTypes).where(eq(worldSettingTypes.projectId, projectId));
  const hasCharacterType = existing.some((type) => type.name === '角色');
  if (hasCharacterType) return;

  await db.insert(worldSettingTypes).values({
    id: `wst-characters--${projectId}`,
    projectId,
    name: '角色',
    icon: '👤',
    description: '角色档案：外貌、性格、背景、关系、持有物品、技能、状态变化',
    isPreset: 0,
    sortOrder: 999,
    createdAt: now(),
    updatedAt: now(),
  });
}

export async function initializeProjectWorld(projectId: string): Promise<void> {
  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  if (project.worldInitStatus === 'running') return;

  const existingTypes = await db.select().from(worldSettingTypes).where(eq(worldSettingTypes.projectId, projectId));
  if (existingTypes.length > 0 && project.worldInitStatus === 'ready') return;

  await setProjectWorldInitState(projectId, 'running', null);

  try {
    const mastra = getMastra();
    const director = mastra.getAgentById('preset-director');
    const requestContext = new RequestContext();
    requestContext.set('agentId', 'preset-director');
    requestContext.set('bookId', projectId);
    requestContext.set('projectId', projectId);
    requestContext.set('context', {
      bookId: projectId,
      projectId,
      pageKey: 'world',
      initialization: true,
    });

    const prompt = [
      `书籍已创建：${project.name}`,
      project.genre ? `类型：${project.genre}` : null,
      project.synopsis ? `简介：${project.synopsis}` : null,
      '现在立即初始化该书的世界设定。',
      '要求：',
      '1. 先用 createWorldSettingType 创建 4-8 个适合这本书的分类，分类名必须由当前书的题材和简介推导，不要套用固定默认模板。',
      '2. 分类里必须包含“角色”，并确保角色分类可供后续角色工作流使用。',
      '3. 再为最核心的 2-4 个分类创建初始 world setting 条目，内容要能直接支撑后续创作。',
      '4. 新建前先用 listWorldSettings 查看现状，避免重复创建。',
      '5. 完成后简短总结初始化结果。',
    ].filter(Boolean).join('\n');

    await director.generate(prompt, {
      requestContext,
      memory: {
        resource: `project-${projectId}`,
        thread: `project-init-${projectId}-${randomUUID()}`,
      },
      maxSteps: 12,
    });

    await ensureCharacterType(projectId);
    await setProjectWorldInitState(projectId, 'ready', null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ensureCharacterType(projectId).catch(() => void 0);
    await setProjectWorldInitState(projectId, 'failed', message);
    throw error;
  }
}
