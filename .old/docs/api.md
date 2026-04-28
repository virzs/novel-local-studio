# Novel Local Studio — API 参考

> 最后更新：2026-04-03（建书后 AI 自动初始化世界设定、角色统一纳入 world_settings 管理、Agent 工具权限扩展）

所有请求走 `http://127.0.0.1:4311`，Axum 代理到 Mastra sidecar（`127.0.0.1:4312`）。

---

## 健康 / 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活检查，返回 `status`, `service`, `mode`, `apiBase`, `mastraBase`, `ready`, `timestamp` |
| GET | `/api/shell` | 应用元信息：`app_name`, `shell_mode`, `web_access`, `version` |
| GET | `/api/mastra` | Mastra 连接状态：`enabled`, `base_url`, `gateway_url`, `reachable` |
| GET | `/api/bootstrap` | 启动阶段 + 日志流：`ready`, `phase`, `logs`, `error` |

---

## AI 对话（Vercel AI SDK 兼容端点）

### `POST /api/chat/:agentId`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `messages` | `{role, content, parts?}[]` | ✅ | AI SDK v6 格式消息列表（支持 `parts` 数组） |
| `threadId` | `string` | — | 兼容字段；当前优先使用 `memory.thread` |
| `memory` | `{ thread?, resource? }` | — | Mastra memory 参数；前端实际使用 `memory.thread` 绑定会话 |
| `context` | `object` | — | 兼容字段；当前优先使用 `data` |
| `data` | `object` | — | 页面上下文 meta（bookId / projectId / typeId 等），注入 system prompt 与 RequestContext |
| `model` | `string` | — | 覆盖 agent 默认模型，格式统一为 `provider/model` |
| `autoMode` | `boolean` | — | 是否允许多轮自动迭代；`false` 时每轮 `onIterationComplete` 后暂停 |

路径参数：`agentId` 为当前使用的智能体 ID。

响应：`Content-Type: text/event-stream`，使用 **AI SDK Data Stream 协议**（`uiMessageChunkSchema` 格式）：

- `type: 'start'` — 流开始
- `type: 'start-step'` / `type: 'finish-step'` — 步骤边界（工具调用循环）
- `type: 'text-start'` / `type: 'text-delta'` / `type: 'text-end'` — 文本流
- `type: 'tool-input-available'` — 工具被调用，携带 `toolCallId`, `toolName`, `input`
- `type: 'tool-output-available'` — 工具执行完成，携带 `toolCallId`, `output`
- `type: 'finish'` — 完成信号
- `type: 'error'` — 错误

> **行为**：
> 1. 根据路径参数 `agentId` 加载 agent 配置（system prompt、model）
> 2. 根据 `agentId` 获取该 agent 允许的工具子集（`getToolsForAgent(agentId)`）
> 3. 若无 `bookId`/`projectId` 上下文，工具进一步限制为仅 `createProject`，系统提示追加禁止调用其他工具的规则
> 4. 若有 `threadId`，保存用户消息到 `@mastra/memory`
> 5. 向 LLM Provider 发起 OpenAI 兼容的 streaming 请求
> 6. 支持多轮工具调用循环（默认 maxSteps: 25；无 `bookId` 上下文的 `preset-director` 请求降至 3，防止错误循环）
> 7. 流结束后，若有 `threadId`，保存 AI 回复到 memory

---

## 智能体

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agents-config` | 获取所有已配置智能体（DB） |
| POST | `/api/agents-config` | 新建智能体（`name`、`systemPrompt`、`model`、`provider`） |
| GET | `/api/agents-config/:id` | 获取单个配置 |
| PUT | `/api/agents-config/:id` | 更新（`isPreset` 不可覆盖） |
| DELETE | `/api/agents-config/:id` | 删除（预置智能体返回 403） |
| GET | `/api/agents` | Mastra 运行时注册的智能体 ID 列表 |

---

## 项目

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects` | 获取所有未归档项目（默认按 `updated_at` 排序）；传 `?archived=1` 可改查已归档项目 |
| POST | `/api/projects` | 创建项目（`name`、`synopsis`、`genre`、`status`），响应为 `{ project }`，并异步触发世界设定 AI 初始化 |
| GET | `/api/projects/:id` | 获取单个项目 |
| PUT | `/api/projects/:id` | 更新项目基础字段 |
| PUT | `/api/projects/:id/archive` | 将项目标记为已归档（`archived = 1`） |
| PUT | `/api/projects/:id/unarchive` | 将项目恢复为未归档（`archived = 0`） |
| POST | `/api/projects/:id/world/initialize` | 立即触发/重试该项目的世界设定 AI 初始化，响应为 `{ project }` |
| DELETE | `/api/projects/:id` | 删除项目（级联删除章节 / 角色 / 笔记 / 世界设定） |

**项目状态枚举**：`drafting` | `writing` | `revising` | `completed` | `archived`

**项目附加字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `worldInitStatus` | `idle \| running \| ready \| failed` | 世界设定初始化状态 |
| `worldInitError` | `string \| null` | 初始化失败时的错误信息 |

> `POST /api/projects` 与 AI 工具 `createProject` 都会在写入项目后异步调用 Director agent，对新书执行一次世界设定初始化。

---

## 章节

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:projectId/chapters` | 获取项目所有章节，按 `order` 排序 |
| POST | `/api/projects/:projectId/chapters` | 创建章节（`title`、`content`、`order`） |
| GET | `/api/chapters/:id` | 获取单个章节 |
| PUT | `/api/chapters/:id` | 更新章节（自动计算 `wordCount`） |
| DELETE | `/api/chapters/:id` | 删除章节 |

---

## 大纲（Outlines）

> 大纲与章节正文完全分离：`outlines` 负责卷/章节节点的结构规划，`chapters` 负责正文写作。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:projectId/outlines` | 获取项目所有大纲节点（平铺返回，前端按 `parentId` 组装树） |
| POST | `/api/projects/:projectId/outlines` | 创建大纲节点（`title`、`description`、`type`、`parentId`、`order`、`status`） |
| PUT | `/api/outlines/:id` | 更新大纲节点 |
| DELETE | `/api/outlines/:id` | 删除大纲节点；删除 `volume` 时会先删除其子章节节点 |

**节点类型枚举**：`volume` | `chapter`

**节点状态枚举**：`draft` | `done`

---

## 世界设定

### 设定类型（分类）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:projectId/world/types` | 获取项目所有设定类型（不再自动 seed 默认类型） |
| POST | `/api/projects/:projectId/world/types` | 新建类型（`name`、`icon`、`description`） |
| PUT | `/api/world/types/:id` | 更新类型 |
| DELETE | `/api/world/types/:id` | 删除类型（级联删除该类型下所有设定） |

不再有“首次访问 world 页面自动生成默认 12 类”的行为。

当前行为：书籍创建后，后端会异步调用 Director agent 自动生成 4-8 个贴合题材的分类，并补充 2-4 条初始设定。若初始化失败，前端 world 页面允许用户手动重试 `POST /api/projects/:id/world/initialize`。

> **角色统一管理**：角色不再使用独立的 `characters` 表进行 AI 工作流管理，而是作为 world_settings 的"角色"分类条目（typeId: `wst-characters--{projectId}`）。每个角色的 `content` 字段以 Markdown 形式记录完整角色卡（包含动态状态如持有物品、已学技能、人物关系等），随剧情推进由 AI 通过 `updateWorldSetting` 持续更新。

### 设定条目

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/:projectId/world/settings` | 获取项目所有设定（可加 `?typeId=` 过滤分类） |
| POST | `/api/projects/:projectId/world/settings` | 创建设定（`title`、`typeId`、`summary`、`content`、`tags`） |
| GET | `/api/world/settings/:id` | 获取单条设定 |
| PUT | `/api/world/settings/:id` | 更新设定 |
| DELETE | `/api/world/settings/:id` | 删除设定 |

---

## LLM Provider

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/providers` | 获取所有 Provider（`apiKey` 脱敏为 `***`） |
| POST | `/api/providers` | 新增（`name`、`type`、`baseUrl`、`apiKey`、`models`） |
| GET | `/api/providers/:id` | 获取单个 Provider |
| PUT | `/api/providers/:id` | 更新（传 `***` 不覆盖已存密钥） |
| DELETE | `/api/providers/:id` | 删除（预置 Provider 不可删） |
| GET | `/api/providers/:id/models` | 代理请求 Provider 的 `/models` 接口 |

**Provider 类型**：`openai` / `anthropic` / `ollama` / `custom`

---

## 对话（会话线程）

对话线程通过 `@mastra/memory` 管理，支持按 `agentId` 或 `projectId` 过滤。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/conversations` | 列出会话线程（见下方查询参数） |
| POST | `/api/conversations` | 新建会话 |
| GET | `/api/conversations/:id` | 获取单条会话及完整消息历史 |
| PUT | `/api/conversations/:id` | 更新会话（标题、projectId 绑定） |
| DELETE | `/api/conversations/:id` | 删除会话及其所有消息 |

### `GET /api/conversations` 查询参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `projectId` | `string` | 按书籍过滤（优先级高于 `agentId`），查询 `metadata.projectId` |
| `agentId` | `string` | 按智能体过滤（仅在无 `projectId` 时生效），查询 `resourceId` |

**过滤逻辑**：当 `projectId` 存在时，不限制 `resourceId`，即同一书籍下不同智能体的对话都会返回。当仅有 `agentId` 时，按 `resourceId` 过滤。

### `POST /api/conversations` 请求体

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | — | 自定义线程 ID（默认自动生成 UUID），用于前端预分配 ID 场景 |
| `agentId` | `string` | — | 智能体 ID（默认 `novel-writing-agent`），存为 `resourceId` |
| `title` | `string` | — | 对话标题（默认「新对话」） |
| `projectId` | `string` | — | 书籍 ID，存入 `metadata.projectId` |

### `PUT /api/conversations/:id` 请求体

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | `string` | 更新对话标题 |
| `projectId` | `string` | 绑定/更新书籍 ID（存入 `metadata.projectId`） |

### `GET /api/conversations/:id` 响应格式

```json
{
  "id": "thread-uuid",
  "resourceId": "agent-id",
  "title": "对话标题",
  "metadata": { "projectId": "book-uuid" },
  "createdAt": "2026-03-31T...",
  "updatedAt": "2026-03-31T...",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

消息历史通过 `@mastra/memory` 的 LibSQLStore 持久化，数据库路径同主库。

---

## 全局设置（KV Store）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/settings` | 获取所有 KV（含 `api_key` 字段自动脱敏） |
| GET | `/api/settings/:key` | 获取单个值 |
| PUT | `/api/settings/:key` | 写入 / 覆盖（upsert） |

---

## 数据库表结构

| 表名 | 用途 | 级联删除 | ORM |
|---|---|---|---|
| `projects` | 小说项目 | — | ✅ Drizzle |
| `chapters` | 章节（属于项目） | 删除项目时级联 | ✅ Drizzle |
| `world_setting_types` | 世界设定分类（属于项目，由 AI 初始化或用户手动创建） | 删除项目时级联 | ✅ Drizzle |
| `world_settings` | 世界设定条目（属于项目+类型） | 删除项目/类型时级联 | ✅ Drizzle |
| `outlines` | 故事大纲节点（属于项目，支持卷→章节两级结构） | 删除项目时级联 | ✅ Drizzle |
| `agents` | 智能体配置 | — | ✅ Drizzle |
| `settings` | 全局 KV 配置 | — | ✅ Drizzle |
| `providers` | LLM Provider 配置 | — | ✅ Drizzle |

> **Mastra Memory 表**（由 `@mastra/memory` 自动管理）：`threads`、`messages` — 存储对话线程和消息记录，`threads.metadata` JSON 字段存储 `projectId` 等扩展信息。

数据库文件路径：
- 开发：`mastra/data/novel-studio.db`
- 生产：`$APP_DATA_DIR/novel-studio.db`（Tauri 注入系统标准应用数据目录）

---

## 工具访问控制（多智能体）

`getToolsForAgent(agentId)` 函数根据 `AGENT_TOOL_MAP` 按 agent ID 返回允许使用的工具子集（最小权限原则）。当前工具集已包含：

- 项目：`createProject`
- 世界设定：`createWorldSetting` / `updateWorldSetting` / `listWorldSettings` / `createWorldSettingType`
- 章节：`createChapter` / `updateChapter` / `listChapters` / `updateChaptersBySetting`
- 大纲：`createOutline` / `updateOutline` / `listOutlines`

**角色统一管理**：角色设计师（`preset-character-designer`）通过 `createWorldSetting`/`updateWorldSetting` 在「角色」分类下管理角色；写作执行（`preset-writer`）写完章节后通过 `updateWorldSetting` 同步设定变更。

当请求中无 `bookId`/`projectId` 上下文时（如在 `/new-book` 页面），工具进一步限制为仅 `createProject`，同时系统提示追加显式禁止规则，`maxSteps` 降至 3。

`createProject` 工具显式设置 `archived: 0`，并将 `worldInitStatus` 初始化为 `idle`。项目写入后后端异步调用 `initializeProjectWorld(projectId)`，由 Director 自动生成首批 world 分类与设定。

> 完整的 agent-tool 权限分配表见 [architecture.md — 多智能体系统架构](architecture.md#多智能体系统架构)
