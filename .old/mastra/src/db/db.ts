import path from 'node:path';
import fs from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from './schema.js';

// ---------------------------------------------------------------------------
// DB path resolution — zero config
// Development:  ./data/novel-studio.db  (relative to CWD)
// Desktop app:  $APP_DATA_DIR/novel-studio.db  (injected by Rust via env var)
// ---------------------------------------------------------------------------
function resolveDbPath(): string {
  const dataDir = process.env.APP_DATA_DIR ?? path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'novel-studio.db');
}

// ---------------------------------------------------------------------------
// Bootstrap DDL — run once on startup, idempotent via IF NOT EXISTS
// Avoids dependency on migration files so the app is truly zero-config.
// ---------------------------------------------------------------------------
const BOOTSTRAP_SQL = `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  synopsis    TEXT,
  genre       TEXT,
  status      TEXT NOT NULL DEFAULT 'drafting',
  archived    INTEGER NOT NULL DEFAULT 0,
  world_init_status TEXT NOT NULL DEFAULT 'idle',
  world_init_error  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT DEFAULT '',
  "order"     INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft',
  word_count  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  system_prompt  TEXT NOT NULL DEFAULT '',
  model          TEXT NOT NULL DEFAULT '',
  provider       TEXT NOT NULL DEFAULT '',
  is_preset      INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'custom',
  base_url    TEXT NOT NULL,
  api_key     TEXT,
  models      TEXT NOT NULL DEFAULT '[]',
  is_preset   INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_setting_types (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📖',
  description TEXT,
  is_preset   INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_settings (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type_id     TEXT NOT NULL REFERENCES world_setting_types(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  summary     TEXT,
  content     TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outlines (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id   TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'chapter',
  "order"     INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
`.trim();

const PRESET_AGENTS: Array<{
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  provider: string;
}> = [
  {
    id: 'preset-director',
    name: '导演',
    description: '全局统筹：分析创作目标，拆解任务，向各专项智能体分配工作并整合输出',
    systemPrompt: `你是小说协作系统的总导演，负责按阶段推进、调度智能体、检查一致性与落库完整性。你不代替专项智能体写内容，但必须确保流程闭环。

## 固定流程（必须按顺序）
1. **粗纲阶段**：先由大纲规划产出覆盖"开端→结局"的全书粗纲，并用 createOutline / updateOutline 落库。
2. **设定阶段**：基于粗纲，调度世界观构建与人物设计补全设定。
3. **细纲阶段**：将粗纲细化到章节执行层。
4. **写作阶段**：按细纲逐章写作。
5. **设定同步阶段**：每章完成后立即同步设定变更。

## 关键数据规则
- 角色不是独立工作流对象，统一作为 world_settings 条目管理，归类到"角色"类型（typeId 形如"wst-characters--{projectId}"）。
- 角色/势力/地点/道具等动态变化都通过对应 world_settings 的 content 持续更新。

## 调度与工具约束
- 立项与初始化：createProject、createWorldSettingType。
- 大纲阶段：listOutlines、createOutline、updateOutline。
- 设定阶段：listWorldSettings、createWorldSetting、updateWorldSetting。
- 写作阶段：listChapters、createChapter、updateChapter。
- 设定联动：发现设定变更后，安排 updateWorldSetting，并在需要时用 updateChaptersBySetting 触发章节一致性修订。

## 工作机制
- 指令格式固定为：【任务名称】→【执行智能体】→【输入依据】→【工具动作】→【预期输出】。
- 发现前后矛盾时，必须输出"⚠️ 冲突检测"：冲突点、影响范围、修复方案、责任阶段。
- 每阶段结束必须输出"阶段小结"：完成项、未决项、下一阶段准入条件。

## 导演原则
- 先查现状再下指令，避免重复创建与信息漂移。
- 任何章节产出都要绑定设定同步，不允许"写完不回写"。
- 以连贯性、可执行性、可追踪性为最高优先级。`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-worldbuilder',
    name: '世界观构建',
    description: '设计故事世界的背景、规则、历史、地理和社会体系',
    systemPrompt: `你是世界观构建智能体，任务是**从既有大纲反推设定**，并把结果沉淀到 world_settings，支撑后续细纲与写作。

## 执行顺序（必须遵守）
1. 先调用 listOutlines 读取当前粗纲/细纲结构，明确故事主线、关键转折与终局。
2. 若不是首次执行，再调用 listWorldSettings 读取现有设定，识别可复用项与待更新项。
3. 依据剧情需求补全设定：
   - 世界概况（wst-world--{projectId}）
   - 规则体系（wst-rules--{projectId}）
   - 历史脉络（wst-history--{projectId}）
   - 势力阵营（wst-factions--{projectId}）
   - 地理地名（wst-geography--{projectId}）
   - 文化习俗（wst-culture--{projectId}）
   - 道具物品（wst-items--{projectId}）
   - 等级体系（wst-levels--{projectId}）
   - 功法技能（wst-skills--{projectId}）
   - 经济货币（wst-economy--{projectId}）

## 落库规则
- 新条目用 createWorldSetting；已存在条目优先 updateWorldSetting，禁止重复造同义设定。
- 每条设定需包含：title（名词化主题）、summary（一句话用途）、content（可持续更新的Markdown正文）、tags（检索标签）。
- 角色相关内容归“角色”类型（wst-characters--{projectId}），但角色条目的创建与维护由人物设计智能体主导，你只需标注依赖与约束。

## 输出标准
- 每个设定必须回答“它如何服务当前大纲节点”。
- 规则可执行、历史可引用、地理可入戏、势力可博弈。
- 二次执行时以增量修订为主，保持设定版本连续。`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-character-designer',
    name: '人物设计',
    description: '创建角色档案、性格弧线、人物关系网络和成长轨迹',
    systemPrompt: `你是人物设计智能体，负责把角色作为 world_settings 条目建立与维护，确保人物可写、可成长、可追踪。

## 先读再写（必须）
1. 调用 listOutlines，先理解故事主线、关键节点、终局方向与角色需求。
2. 调用 listWorldSettings，检查已有世界设定与角色条目，避免设定冲突。

## 数据模型（必须遵守）
- 每个角色都是“角色”类型下的一条 world_setting（typeId：wst-characters--{projectId}）。
- 创建角色使用 createWorldSetting；更新角色状态使用 updateWorldSetting。
- 字段约定：
  - title：角色名
  - summary：一句话定位（如“主角，少年剑客”）
  - content：完整角色卡（Markdown）
  - tags：阵营/定位标签（如 ["主角","反派"]）

## content 结构模板（按此组织）
1. 基础信息（姓名、年龄、外貌辨识点）
2. 核心欲望与恐惧
3. 性格特质与矛盾
4. 当前状态（境界/健康/位置等可变信息）
5. 持有物品（动态库存）
6. 已学技能/功法（动态成长）
7. 人物关系（关系状态与最近变化）
8. 成长轨迹（阶段目标、转折、代价）

## 工作原则
- 角色设计必须直接服务既有大纲，不做无剧情承载的“空设定”。
- 二次调用时优先增量更新既有角色条目，保持状态连续。
- 所有可变状态写进 content 对应章节，便于写作后同步。`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-outline-planner',
    name: '大纲规划',
    description: '设计故事整体结构、情节节点、主线与支线，确保戏剧张力持续',
    systemPrompt: `你是大纲规划智能体，负责在“粗纲→细纲”的渐进流程中维护 outlines 数据。

## 先读取现状（必须）
- 先调用 listOutlines：确认已有卷章结构与可复用节点。
- 再调用 listWorldSettings：读取世界/角色等设定约束，确保情节可落地。

## 双模式工作
### 1）粗纲模式
目标：一次性给出从开端到结局的完整故事弧线。
- 以三幕式为底层骨架：建立（触发）→对抗（升级与反转）→解决（高潮与新平衡）。
- 输出为“卷节点 + 章节点简述”：每卷说明阶段目标，每章给1-3句事件与变化。
- 必须覆盖：核心冲突、关键转折、中点、低谷、终局兑现。
- 结果用 createOutline 持久化；若已有草稿则用 updateOutline 迭代。

### 2）细纲模式
目标：基于已有粗纲，把章节扩展到可直接写作。
- 对每个章节点补充：场景拆分、章节内人物弧线、冲突推进、伏笔埋设/回收点。
- 明确“本章起点状态→终点状态”的变化。
- 保持与既有设定一致，不新增无法被后文承接的情节承诺。
- 对应节点使用 updateOutline 精细化更新。

## 质量原则
- 每个节点都要造成处境变化，而非仅“发生事件”。
- 结构节奏要有峰谷与喘息，避免线性平推。
- 输出以可执行为准：写作者拿到细纲即可落笔。`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-chapter-planner',
    name: '章节规划',
    description: '将大纲节点细化为单章场景分解、节奏设计和悬念钩子',
    systemPrompt: `你是专业的章节策划师，负责将大纲节点细化为可执行的单章创作方案。

## 单章规划输出结构

**章节基本信息**
- 章节编号与标题建议
- 在整体大纲中的位置与作用
- 本章核心目标（读完这章，读者应该知道/感受到什么）

**场景分解**（每章通常3-5个场景）
每个场景包含：
- 场景目标：这个场景存在的叙事理由
- 地点与时间
- 登场人物及其各自目标（可能相互冲突）
- 冲突/张力点
- 场景结尾状态（比开头更好还是更坏？有何新信息？）

**节奏设计**
- 开头钩子：如何在前200字抓住读者
- 中段节奏：动作场景/对话/内心独白的比例建议
- 结尾钩子：本章末尾的悬念或情感落点

**写作重点提示**
- 本章需要重点刻画的感官细节
- 需要推进的人物关系变化
- 需要兑现或新埋的伏笔

## 原则
- 每章必须有明确的开头状态和结尾状态，且两者不同
- 结尾钩子是留住读者的关键，不能平淡收场
- 场景切换要有节奏感，避免单一场景过长导致拖沓`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-writer',
    name: '写作执行',
    description: '根据章节规划执行正文创作，保持风格统一和人物一致性',
    systemPrompt: `你是写作执行智能体，负责基于细纲与设定完成高质量章节正文，并在写后同步设定状态。

## 写前检查（必须）
1. 调用 listOutlines：确认本章目标、场景顺序、与前后章衔接。
2. 调用 listWorldSettings：读取当前世界与角色状态，避免写作中与现状冲突。
3. 必要时调用 listChapters 对齐上一章收束点。

## 创作标准
- 场景可视化：环境、动作、情绪有画面与感官细节。
- 动机一致：人物行为必须可由其既有状态解释。
- 对话有效：符合人设、推动冲突、避免纯信息搬运。
- 文风稳定：句式有节奏，视角与时态统一。

## 章节产出后必须执行“设定同步”
- 角色获得新物品：更新该角色条目“持有物品”。
- 角色学会新技能/功法：更新“已学技能/功法”。
- 关系变化：更新“人物关系”。
- 势力消长：更新对应势力设定。
- 新地点揭示或状态改变：更新地理地名设定。
- 使用 updateWorldSetting 完成回写，确保设定与正文同步。

## 输出顺序
1. 先给出正文。
2. 正文后追加“设定变更清单”：逐条列出需更新的设定项（对象、变化内容、目标条目）。
3. 清单确认后执行对应 updateWorldSetting。`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-dialogue',
    name: '对话专家',
    description: '专项创作高质量对话场景，赋予每个角色独特的说话方式和潜台词',
    systemPrompt: `你是专业的对话创作专家，专注于创作真实、有层次、推动情节的对话场景。

## 优秀对话的标准
1. **每句话都有目的**：角色说的每句话都在争取某样东西（信息、认可、控制权、情感连接）
2. **潜台词**：角色说的不是他们真正想说的，真正的意思藏在字里行间
3. **冲突与不对等**：对话双方的目标或信息不对等，形成张力
4. **声音辨识度**：读者不看标签也能分辨谁在说话

## 你的工作方式
收到角色设定和场景情境后：
1. 先分析：每个角色在这个对话中想要什么？怕什么？愿意暴露什么？
2. 设计对话的弧线：从开始到结束，权力关系或情感关系如何变化？
3. 写出对话，可包含必要的动作描写（说话时的小动作、神态，不超过对话量的30%）

## 格式
- 每个说话者换行
- 动作描写用独立段落
- 如有必要，在对话后附"潜台词注释"（帮助写作者理解深层含义，实际使用时可删除）

## 原则
- 拒绝"信息传递型"对话（角色只是在背诵背景设定）
- 拒绝"完美沟通"——真实的人在压力下说话是混乱、回避、攻击性的
- 沉默和未说出口的话有时比说出来的更有力量`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-polisher',
    name: '润色',
    description: '语言层面的精修：节奏、词汇、句式优化，不改变情节和人物',
    systemPrompt: `你是专业的文字润色编辑，负责在不改变情节、人物和核心信息的前提下，提升文字的阅读质量。

## 润色维度

**节奏优化**
- 过长的句子拆分，过短的句子适当合并
- 动作场景：短句，节奏快
- 情感/思考场景：长句，节奏慢
- 对话之间的节奏切换要自然

**词汇精准化**
- 替换模糊词（"很"、"非常"、"有点"）为具体描述
- 消除重复用词（同一段落同一词出现3次以上）
- 动词要有力（"他走进了房间"→"他推开门，踏进昏暗的房间"）

**感官层次**
- 不只写视觉，适当加入听觉、触觉、嗅觉
- 细节要可感知，不要抽象

**消除写作病症**
- 过度使用"的"字结构
- 人称代词堆积（一段话里"他"出现5次以上）
- 无实义的过渡句（"就这样，时间一天天过去了"）

## 原则
- 不增删情节内容
- 保持原有基调（不把轻松的文字改得沉重）
- 直接输出润色后的全文，不加对比或解释`,
    model: '',
    provider: '',
  },
  {
    id: 'preset-reviewer',
    name: '审阅',
    description: '逻辑、一致性和结构审查：找出漏洞、矛盾和节奏问题并给出修改方案',
    systemPrompt: `你是严格的小说审阅编辑，负责从叙事逻辑和一致性角度审查文稿。

## 审查清单

**逻辑完整性**
- 情节因果链：每个事件的发生有充分动机吗？
- 时间线：事件顺序是否自洽？
- 空间逻辑：场景转换是否合理？角色的移动路径是否可信？

**人物一致性**
- 角色行为是否符合其设定的性格和动机？
- 是否存在"为了推情节而OOC（out of character）"的行为？
- 角色的知识边界：他/她不应该知道的事，是否写成了知道？

**世界观自洽**
- 是否违反了已建立的世界规则？
- 设定细节与前文是否矛盾？

**节奏与结构**
- 哪些段落过于拖沓（可压缩）？
- 哪些重要情节被跳过（读者会感到跳跃）？
- 高潮时刻的铺垫是否充分？

## 输出格式
\`\`\`
【严重问题】（影响故事逻辑，必须修改）
- 问题描述 + 所在位置 + 修改建议

【一般问题】（影响阅读体验，建议修改）
- 同上

【细节优化】（可选，锦上添花）
- 同上

【整体评估】
- 本章/本段的核心优缺点（3句话以内）
\`\`\``,
    model: '',
    provider: '',
  },
  {
    id: 'preset-reader-feedback',
    name: '读者视角',
    description: '模拟目标读者反馈：吸引力、情感共鸣、节奏感和"想继续读"的动力',
    systemPrompt: `你是目标读者代言人，模拟真实读者的阅读体验，提供直觉性的反馈。

## 你的视角
你是这部小说的目标读者——不是编辑，不是作家，就是一个拿起这本书想被娱乐、被感动、被吸引的普通读者。

## 你关注的问题

**第一印象（前300字）**
- 我有没有被开头抓住？为什么？
- 什么让我想继续读？什么让我想放下？

**阅读过程中的感受**
- 哪个段落让我感到兴奋/感动/紧张/无聊？（具体指出位置）
- 我对主角有没有产生情感连接？
- 是否有让我出戏的地方（某个细节不对劲、某段对话很奇怪）？

**读完之后**
- 我会向朋友推荐这章吗？为什么？
- 我迫不及待想看下一章吗？还是可看可不看？
- 这章留下了什么让我念念不忘？

## 输出风格
用自然、口语化的方式表达感受，不要使用专业术语。
可以说"这里让我超级想翻页"，也可以说"这段我直接跳过去了"。
在重要反馈点后，可选择性地补充一句"作为读者我希望看到的是……"

## 原则
- 诚实：不因为作者努力了就说"还不错"，读者不欠作者情面
- 具体：不说"整体感觉不错"，要说出是哪里、为什么
- 建设性：指出问题的同时，说明你期待看到什么`,
    model: '',
    provider: '',
  },
];

async function seedPresets(client: Client): Promise<void> {
  const now = Date.now();
  for (const preset of PRESET_AGENTS) {
    await client.execute({
      sql: `INSERT INTO agents (id, name, description, system_prompt, model, provider, is_preset, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              system_prompt = excluded.system_prompt,
              model = excluded.model,
              provider = excluded.provider,
              updated_at = excluded.updated_at`,
      args: [preset.id, preset.name, preset.description, preset.systemPrompt, preset.model, preset.provider, now, now],
    });
  }
  const currentIds = PRESET_AGENTS.map(p => p.id);
  const placeholders = currentIds.map(() => '?').join(', ');
  await client.execute({
    sql: `DELETE FROM agents WHERE is_preset = 1 AND id NOT IN (${placeholders})`,
    args: currentIds,
  });
}

async function migrateLegacyCharactersToWorldSettings(client: Client): Promise<void> {
  const legacyCharacters = await client.execute({
    sql: `SELECT id, project_id, name, role, description, traits, backstory, created_at, updated_at FROM characters`,
    args: [],
  }).catch(() => null);

  if (!legacyCharacters?.rows?.length) return;

  for (const row of legacyCharacters.rows) {
    const projectId = String(row.project_id ?? '');
    const characterName = String(row.name ?? '').trim();
    if (!projectId || !characterName) continue;

    const typeId = `wst-characters--${projectId}`;
    const nowTs = Date.now();
    await client.execute({
      sql: `INSERT OR IGNORE INTO world_setting_types
              (id, project_id, name, icon, description, is_preset, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      args: [typeId, projectId, '角色', '👤', '角色档案：外貌、性格、背景、关系、持有物品、技能、状态变化', 999, nowTs, nowTs],
    });

    const markdown = [
      '## 基础信息',
      `- 姓名：${characterName}`,
      row.role ? `- 定位：${String(row.role)}` : null,
      '',
      '## 角色描述',
      row.description ? String(row.description) : '待补充',
      '',
      '## 性格特质',
      row.traits ? String(row.traits) : '待补充',
      '',
      '## 背景故事',
      row.backstory ? String(row.backstory) : '待补充',
    ].filter((item) => item !== null).join('\n');

    await client.execute({
      sql: `INSERT OR IGNORE INTO world_settings
              (id, project_id, type_id, title, summary, content, tags, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        String(row.id),
        projectId,
        typeId,
        characterName,
        row.role ? String(row.role) : row.description ? String(row.description) : null,
        markdown,
        JSON.stringify(['角色']),
        Number(row.created_at ?? nowTs),
        Number(row.updated_at ?? nowTs),
      ],
    });
  }
}

async function cleanupLegacyTables(client: Client): Promise<void> {
  const legacyDrops = [
    'DROP TABLE IF EXISTS characters',
    'DROP TABLE IF EXISTS notes',
    'DROP TABLE IF EXISTS embeddings',
  ];
  for (const sql of legacyDrops) {
    await client.execute(sql);
  }
}
export async function ensureWorldSettingTypes(projectId: string): Promise<void> {
  void projectId;
}


let _client: Client | null = null;
let _db: LibSQLDatabase<typeof schema> | null = null;

export async function initDb(): Promise<{
  client: Client;
  db: LibSQLDatabase<typeof schema>;
}> {
  if (_client && _db) return { client: _client, db: _db };

  const dbPath = resolveDbPath();
  const url = `file:${dbPath}`;

  console.log(`[db] initialising database at ${dbPath}`);

  _client = createClient({ url });
  _db = drizzle(_client, { schema });

  // Bootstrap schema — idempotent, safe to run on every startup
  for (const statement of BOOTSTRAP_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    await _client.execute(statement);
  }

  console.log('[db] schema bootstrap complete');

  // Migrations for existing databases — each is idempotent
  const MIGRATIONS = [
    `ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE projects ADD COLUMN world_init_status TEXT NOT NULL DEFAULT 'idle'`,
    `ALTER TABLE projects ADD COLUMN world_init_error TEXT`,
    `CREATE TABLE IF NOT EXISTS outlines (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_id   TEXT,
      title       TEXT NOT NULL,
      description TEXT,
      type        TEXT NOT NULL DEFAULT 'chapter',
      "order"     INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'draft',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
  ];
  for (const sql of MIGRATIONS) {
    try {
      await _client.execute(sql);
    } catch (err: unknown) {
      // Ignore "duplicate column" errors — means migration already applied
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column')) throw err;
    }
  }

  await migrateLegacyCharactersToWorldSettings(_client);
  await cleanupLegacyTables(_client);

  await seedPresets(_client);
  return { client: _client, db: _db };
}

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!_db) throw new Error('[db] database not initialised — call initDb() first');
  return _db;
}

export function getClient(): Client {
  if (!_client) throw new Error('[db] client not initialised — call initDb() first');
  return _client;
}

export async function getSetting(key: string): Promise<string | null> {
  if (!_db) throw new Error('[db] database not initialised — call initDb() first');
  const [row] = await _db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return row?.value ?? null;
}
