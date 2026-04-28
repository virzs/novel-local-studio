# 开发路线图：多智能体协作系统

> 最后更新：2026-04-03
> 状态：**Phase 0 已完成** ✅ — Phase 1 进行中
>
> Phase 0 架构决策和实现细节见 [architecture.md](./architecture.md)

---

## 架构：Supervisor 模式

基于 Mastra 框架的 Supervisor Agent 模式，Director 作为总指挥，将子智能体注册为可调用工具。

```
用户 <-> 对话UI <-> Director (Supervisor Agent)
                        ├── preset-worldbuilder      世界观构建
                        ├── preset-character-designer 角色设计
                        ├── preset-outline-planner    大纲规划
                        ├── preset-writer             章节写作
                        └── preset-reviewer           审校润色
```

> 其余 5 个 preset agent（chapter-planner、dialogue、polisher、reader-feedback）保持独立，不纳入 Supervisor 委派。

### Director 职责（仅协调，不直接写作）

1. 读取 Working Memory 中的创作状态，判断当前焦点
2. 结合用户输入决定委派给哪个子智能体（无固定阶段顺序）
3. 汇总子智能体结果，更新 Working Memory，决定下一步
4. 在手动模式下询问用户确认

### 子智能体职责

每个子智能体拥有对应的工具（已有 `AGENT_TOOL_MAP`），**实际的数据库读写由子智能体完成**。

---

## 技术基础：Mastra Supervisor API

### Agent 注册

```typescript
const director = new Agent({
  id: 'preset-director',
  instructions: '...',
  model: '...',
  agents: {
    'preset-worldbuilder': worldbuilder,
    'preset-character-designer': characterDesigner,
    'preset-outline-planner': outlinePlanner,
    'preset-writer': writer,
    'preset-reviewer': reviewer,
  },
  memory: sharedMemory, // 所有子智能体通过 resource 共享记忆
})
```

子智能体必须提供 `description` 属性，Supervisor 依据此决定委派时机。

### 关键钩子

| 钩子 | 用途 |
|------|------|
| `onIterationComplete` | 每轮委派完成后触发，控制是否继续（Auto/Manual 模式核心） |
| `delegation.onDelegationStart` | 委派前拦截，可修改 prompt 或拒绝 |
| `delegation.onDelegationComplete` | 委派完成后触发，可写入进度、注入反馈 |
| `delegation.messageFilter` | 控制传递给子智能体的上下文消息 |

### API 兼容性

Supervisor 使用标准 `stream()` / `generate()`，**`/api/chat/:agentId` 端点已迁移完成**（Phase 0 ✅）。当前 `preset-director` 已在 `mastra.ts` 中注册为带 `agents` 的 Supervisor Agent，前端对话直接走 `/api/chat/preset-director`。

> **备选方案**：Mastra 提供 `networkRoute()` 用于 Agent Network（多 agent 协作网络）。若 Supervisor 的 `agents` 配置不够灵活，可考虑使用 Agent Network + `networkRoute()` 代替。待 Phase 1 实施时评估。

---

## 工作模式（取代固定阶段）

不采用固定七阶段线性流水线。小说创作是迭代的——写到第 10 章可能需要回头调角色设定，世界观在写作过程中持续扩充。

Director 根据 Working Memory 中的 `focus` 字段 + 用户输入，自主决定当前工作模式：

| 模式 | 触发条件 | 负责智能体 |
|------|---------|-----------|
| `project_init` | 新书创建 | Director 调用 `createProject`，随后系统异步触发 world 初始化 |
| `world_editing` | 需要构建/修改世界观 | `preset-worldbuilder` |
| `char_editing` | 需要设计/调整角色 | `preset-character-designer` |
| `outline_editing` | 需要规划/修改大纲 | `preset-outline-planner` |
| `chapter_draft` | 开始写新章节（给出剧情选项） | `preset-writer` |
| `chapter_write` | 用户选择剧情后正式写作 | `preset-writer` |
| `review` | 审校已写章节 | `preset-reviewer` |

各模式之间可以**自由跳转**，Director 通过 system prompt + Working Memory 自主判断转换时机，无需硬编码状态机。

### 首次创作的推荐流程

对于新书，Director 的 system prompt 引导按以下顺序推进（但不强制）：

```
project_init → world_editing → char_editing → outline_editing
→ [chapter_draft → chapter_write → review] × N 章
```

用户可以随时打断流程，要求修改之前的任何模块。

---

## Auto 模式机制

### 前端

对话框底部增加 Auto / Manual 开关，状态通过消息 metadata 传递给后端。

### 后端

利用 `onIterationComplete` 钩子：

```
每次 Director 完成一轮委派后：
  1. 读取当前 autoMode 状态
  2. 读取 Working Memory 中的当前焦点

  如果 焦点 == chapter_draft（剧情选项阶段）：
    -> 强制暂停，Director 输出剧情选项
    -> return { continue: false }

  如果 autoMode == true 且 焦点 != chapter_draft：
    -> return { continue: true }  // 自动进入下一步

  如果 autoMode == false：
    -> Director 生成阶段总结 + 确认问题
    -> return { continue: false }  // 等待用户回复
```

用户回复后对话继续，Director 根据反馈决定：重做当前内容 / 进入下一步 / 修改特定模块。

---

## 章节写作的特殊流程

章节写作**无论 Auto 还是 Manual 都强制暂停**，必须由用户选择剧情走向。

```
1. Director 委派 preset-writer：
   "根据大纲和已有章节，给出 2-3 个不同的剧情走向"

2. preset-writer 返回选项（不写入 DB）：
   选项 A：主角通过智谋化解危机
   选项 B：主角被迫正面对决
   选项 C：意外第三方介入

3. Director 将选项展示给用户（强制暂停等待选择）

4. 用户选择后，Director 再次委派 preset-writer：
   "按照选项 B 展开完整内容"

5. preset-writer 写完 -> 调用 createChapter / updateChapter 写入 DB

6. Director 可选委派 preset-reviewer 审校该章

7. Director 更新 Working Memory（章节进度、新增的伏笔/约束）
```

---

## 记忆系统：Mastra Memory

### 总体架构

不自建进度表。使用 Mastra `@mastra/memory` 原生四层记忆系统，通过 `resource = project-{projectId}` 实现同一本书下所有智能体的记忆共享。

```typescript
import { Memory } from '@mastra/memory'
import { LibSQLStore, LibSQLVector } from '@mastra/libsql'

const sharedMemory = new Memory({
  storage: new LibSQLStore({
    id: 'novel-studio-store',
    url: 'file:./data/novel-studio.db',  // 复用现有 DB
  }),
  vector: new LibSQLVector({
    id: 'novel-studio-vector',
    url: 'file:./data/novel-studio.db',  // 向量索引存在同一 DB
  }),
  embedder: /* 用户配置的 embedding 模型，见下方说明 */,
  options: {
    lastMessages: 30,
    semanticRecall: {
      topK: 5,
      messageRange: 2,
      scope: 'resource',  // 跨线程检索同一本书的所有对话
    },
    workingMemory: {
      enabled: true,
      template: WORKING_MEMORY_TEMPLATE,  // 见下方
    },
    observationalMemory: {
      model: /* 用户配置的 OM 模型，见下方说明 */,
      scope: 'resource',
      observation: {
        messageTokens: 30_000,
      },
      reflection: {
        observationTokens: 40_000,
      },
    },
  },
})
```

### 四层记忆及其在小说创作中的用途

| 层 | Mastra 功能 | 小说创作用途 | 质量保障作用 |
|----|------------|------------|------------|
| 短期 | Message History（最近 30 条） | 当前对话上下文 | 确保连续对话的上下文连贯 |
| 工作记忆 | Working Memory | 创作状态、活跃约束、模块摘要 | Director 每次调用都能看到全局状态，避免遗忘伏笔和设定 |
| 长期压缩 | Observational Memory | 整个创作过程的压缩日志 | 长篇写作中保留角色成长、剧情演变的完整脉络 |
| 语义检索 | Semantic Recall | 按语义查找历史设定和剧情细节 | "第 3 章里关于城主的描述是什么"可以精确召回 |

### Working Memory Template

Director 的 Working Memory 采用紧凑结构化格式，最小化 token 占用：

```markdown
## 创作状态
focus: idle
last_action: none
next_step: none

## 活跃约束
（写作时必须遵守的设定、伏笔、时间线约束）

## 模块摘要
world: 未开始
characters: 未开始
outline: 未开始
chapters: 未开始
```

运行时示例（Director 自动维护更新）：

```markdown
## 创作状态
focus: chapter_write/ch003
last_action: user_selected_plot_option_B（正面对决）
next_step: agent-writer drafts ch003 full content

## 活跃约束
- 城主左手旧伤（ch002 伏笔，未解决）
- 时间线：春末，距血月之夜 30 天
- 李云已从中立转向对立阵营（ch002 末确认）

## 模块摘要
world: 基础完成，修炼体系第三层待补
characters: 主要 5 人已建，反派配角待设计
outline: arc1 完成(ch01-ch08)，arc2 草稿
chapters: ch01done ch02done ch03->drafting
```

### 多智能体记忆共享

Mastra 通过 `resource` 机制天然支持跨智能体记忆共享：

```typescript
// 所有智能体使用同一个 projectId 作为 resource
// Director 委派子智能体时，Mastra 自动生成 resourceId = {parentResourceId}-{agentName}
// 因此 resource-scoped 的 Working Memory 和 Semantic Recall 在所有子智能体之间共享

// 手动调用场景下，确保 resource 一致：
await worldbuilder.generate('构建世界观...', {
  memory: { resource: `project-${projectId}`, thread: threadId }
})

await writer.generate('写第 3 章...', {
  memory: { resource: `project-${projectId}`, thread: threadId }
})
// writer 通过 semantic recall 自动检索 worldbuilder 写入的世界观内容
```

### Observational Memory 对长篇写作的价值

OM 通过 Observer + Reflector 两个后台 Agent 自动将长对话压缩为密集观察日志：

```
Observer 产出示例：
- ch003 后：李云确认转向对立阵营，不再是中立角色
- ch005 后：修炼体系第三层"虚境"补充设定——百年一遇天才才能触及
- 当前约束更新：城主左手旧伤仍未解决，需在 arc1 结束前收回
```

**对长篇质量的保障**：

- 压缩比 5-40x，避免 context 窗口被早期原始对话填满
- AI 每次看到的是提炼后的演变脉络，而非几万条原始消息
- 自动追踪 `current-task` 和 `suggested-response`，断点恢复无缝衔接
- Retrieval 模式可按需回溯原始消息，精确核查细节

---

## 内置服务模型配置

Memory 系统中有三处需要独立于"写作用 LLM"之外的模型配置：

| 用途 | 默认模型 | 要求 |
|------|---------|------|
| Semantic Recall Embedder | 需配置 | embedding 模型，用于消息向量化 |
| OM Observer | `google/gemini-2.5-flash` | 128K+ context，快速 |
| OM Reflector | 同 Observer | 同上 |

**这些模型不写死在代码中**，后续通过软件设置页面配置：

- 设置页新增"记忆系统"配置区域（或在现有 LLM 配置页内新增 tab）
- 用户可选择 Embedding 模型（远程 API 或本地 `@mastra/fastembed`）
- 用户可选择 OM 后台模型（推荐低成本高速模型）
- 配置存入现有 `settings` KV 表，Memory 初始化时读取
- 未配置时使用合理默认值，不阻断核心功能

```typescript
// 运行时读取用户配置
const omModel = await getSetting('memory.om_model') ?? 'google/gemini-2.5-flash'
const embedderModel = await getSetting('memory.embedder_model') ?? null

const sharedMemory = new Memory({
  // ...storage, vector 同上
  embedder: embedderModel
    ? new ModelRouterEmbeddingModel(embedderModel)
    : fastembed,  // 未配置时回退到本地 embedding
  options: {
    observationalMemory: {
      model: omModel,
      // ...其余配置同上
    },
  },
})
```

---

## 实现顺序

> 质量优先：每个阶段确保在长篇写作场景下的记忆连贯性和设定一致性。

### Phase 1：Supervisor + Memory 核心

> 前提：Phase 0 ✅（详见 [architecture.md](./architecture.md#mastra-集成决策)）

1. Director Agent 改为 Supervisor 模式（注册 5 个核心子智能体：worldbuilder, character-designer, outline-planner, writer, reviewer） ✅
   - `mastra.ts` 中已将 Director 配置为 `agents: { worldbuilder, characterDesigner, outlinePlanner, writer, reviewer }`
   - 其余 5 个通用 agent（chapter-planner, dialogue, polisher, reader-feedback 等）保持独立
2. 子智能体添加 `description` 属性（Supervisor 依据此决定委派时机） ✅
3. Memory 升级：配置 Working Memory + Semantic Recall ✅
   - Working Memory template 见上方 "Working Memory Template" 部分
   - Semantic Recall：`scope: 'resource'`，跨线程检索同一本书的所有对话
4. 添加 LibSQLVector 支持（向量索引复用现有 DB `file:./data/novel-studio.db`） ✅
5. Embedding 模型：优先集成 `@mastra/fastembed`（本地离线），支持切换为远程 ✅
6. 设置页：新增记忆系统模型配置（Embedding 模型、OM 模型选择） ✅
7. 验证：多轮对话中 Working Memory 正确更新，Semantic Recall 能召回早期设定 ⏳ 继续观察

### Phase 2：Observational Memory

1. 启用 OM，配置 Observer + Reflector ✅
2. OM 模型通过设置页配置（默认 `google/gemini-2.5-flash`） ✅
3. 验证：长对话（50+ 轮）后，AI 仍能准确引用早期设定
4. 验证：OM 压缩后的观察日志保留了关键伏笔和约束
5. 性能评估：OM 后台推理对本地模型用户的影响

### Phase 3：前端交互

> 遵循约束：先确定 UI，再调整后端接口对接。

#### Mastra Custom UI 能力（Phase 0 调研发现）

Mastra + AI SDK v6 提供丰富的 data part 机制用于自定义 UI 渲染：

| Data Part 类型 | 来源 | 用途 |
|---------------|------|------|
| `tool-{toolKey}` | 工具调用时自动生成 | 前端按 toolKey 渲染对应组件（如 `tool-listChapters` → 章节列表卡片） |
| `data-workflow` | Workflow 执行时自动生成 | Workflow 进度可视化 |
| `data-network` | Agent Network 执行时自动生成 | 多 Agent 协作进度可视化 |
| `data-{custom}` | 通过 `context.writer.custom()` 手动发送 | 自定义进度事件、剧情选项等 |

Mastra 还支持 **Workflow 的 suspend/resume** 机制（`suspendSchema` / `resumeSchema` / `suspend()` / `resumeData`），可用于章节剧情选项的确认流程。

#### 前端集成方案

Mastra 官方推荐使用 `@mastra/client-js`（MastraClient）+ `@mastra/react`（MastraClientProvider / useMastraClient）：

```typescript
// 当前方案：AssistantChatTransport + useChatRuntime
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useChatRuntime, AssistantChatTransport } from '@assistant-ui/react-ai-sdk'

const transport = new AssistantChatTransport({
  api: `${API_BASE}/api/chat`,
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      messages,
      memory: threadId ? { thread: threadId, resource: agentId } : undefined,
      data: context,
      model, provider,
    },
    api: `${API_BASE}/api/chat/${agentId}`,
  }),
})
const runtime = useChatRuntime({ transport })

// 方案 B（备选）：MastraClient + useChat
import { MastraClient } from '@mastra/client-js'
import { useChat } from '@ai-sdk/react'

const client = new MastraClient({ baseUrl: '/api' })
const { messages } = useChat({
  api: `${client.baseUrl}/chat/${agentId}`,
  headers: client.headers,
})
```

Phase 3 评估时决定是否迁移到 MastraClient 方案。当前 `@assistant-ui/react` + `AssistantChatTransport` 方案功能完整，MastraClient 在多端点管理时更结构化。

#### 实施清单

1. Auto/Manual 开关组件
   - 对话框底部开关，状态通过 message metadata 传递给后端
   - 后端通过 `onIterationComplete` 钩子控制是否继续委派
2. 剧情选项卡片组件（章节写作时渲染）
   - 利用 `tool-{toolKey}` data part 或 `context.writer.custom()` 传递选项数据
   - 前端识别 data part 类型，渲染为可点击的选项卡片
   - 可选：利用 Workflow suspend/resume 实现选项确认流程
3. 创作状态指示器（可选，读取 Working Memory 渲染当前焦点）
4. 设置页记忆系统配置 UI（Embedding 模型、OM 模型选择）
5. 评估是否引入 `@mastra/client-js` + `@mastra/react` 替代当前的 `@assistant-ui/react` + `AssistantChatTransport` 方案

### Phase 4：长篇质量验证

1. 端到端测试：从新书创建到完成 10+ 章节
2. 一致性检查：角色性格、世界观设定、伏笔在全书范围内无矛盾
3. 回溯测试：写到后期章节时，要求 AI 引用早期设定，验证召回准确性
4. 断点恢复：关闭应用后重新打开，验证 Working Memory 恢复创作状态

---

## 剩余优化项（Phase 0 遗留）

| 项目 | 说明 | 目标阶段 |
|------|------|---------|
| 动态 agent 注册 | 若 Phase 1 后所有 agent 都在 Mastra 注册（含动态），可移除 `toAISdkStream` 回退路径，全部走 `handleChatStream()` | Phase 1 |
| Custom UI 集成 | Mastra 支持 `tool-{toolKey}` data part，前端可渲染工具输出为自定义组件（如剧情选项卡片） | Phase 3 |
| `context.writer` 工具 streaming | 工具执行期间可通过 `context.writer.custom()` 发送进度事件，前端实时渲染 | Phase 3 |
| `@mastra/client-js` + `@mastra/react` | 前端可迁移到 `MastraClient` + `MastraClientProvider` 替代 `@assistant-ui/react` + `AssistantChatTransport`，多端点管理更结构化 | Phase 3 |
