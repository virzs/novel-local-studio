# Novel Local Studio — 功能路线图

> **原则**：AI 写作优先、本地优先、所有配置存储于 SQLite。
> 前端框架：React + Tailwind CSS v4 + Headless UI
> 后端：Node.js Mastra sidecar (packages/mastra) + Drizzle ORM + SQLite

---

## 当前已实现基础

| 层 | 状态 |
|----|------|
| Tauri 桌面壳 + Axum 代理 (4311→4312) | ✅ |
| Mastra sidecar HTTP server | ✅ |
| DB Schema: projects / chapters / characters / notes / embeddings | ✅ |
| CRUD API: projects / chapters / characters | ✅ |
| 前端框架 + 主题设计系统 | ✅ |
| 项目列表展示（只读，无操作） | ✅ |
| 角色/笔记/AI 助手 — 占位页面 | ❌ 待实现 |

---

## 数据库 Schema 扩展计划

在现有 5 张表基础上新增：

### 新增表：`agents`（全局智能体定义）

| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | 显示名称（如"续写助手"） |
| description | TEXT | 简短描述 |
| system_prompt | TEXT | 完整 System Prompt |
| model | TEXT NOT NULL | 模型标识，如 `openai/gpt-4o-mini` |
| provider | TEXT NOT NULL | Provider 标识：openai / ollama / anthropic |
| is_preset | INTEGER | 1=内置预设（不可删除），0=用户自建 |
| created_at | INTEGER NOT NULL | Unix ms |
| updated_at | INTEGER NOT NULL | Unix ms |

### 新增表：`settings`（全局 KV 配置）

| 列 | 类型 | 说明 |
|----|------|------|
| key | TEXT PK | 配置键（如 `llm.openai.api_key`） |
| value | TEXT | 配置值（JSON 字符串或纯文本） |
| updated_at | INTEGER NOT NULL | Unix ms |

> API Key 等敏感数据存储于此表，本地 SQLite，不上传任何远端。

### 新增表：`project_agents`（项目级智能体配置）

| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | UUID |
| project_id | TEXT NOT NULL FK→projects.id | 所属项目 |
| agent_id | TEXT NOT NULL FK→agents.id | 引用的全局智能体 |
| role | TEXT NOT NULL | 在此项目中的角色：writer / reviewer / character / editor |
| writing_style | TEXT | 写作风格补充 Prompt（追加到 System Prompt） |
| pov | TEXT | 人称：first / third / omniscient |
| tone | TEXT | 语气：serious / humorous / dark / light |
| created_at | INTEGER NOT NULL | Unix ms |
| updated_at | INTEGER NOT NULL | Unix ms |

---

## 路线图（按优先级排序）

---

### P0 — 全局智能体管理

**目标**：用户可在设置页看到、新建、编辑、删除 AI 智能体；同时配置 LLM Provider 和 API Key。

**后端任务**：
- [ ] `schema.ts` 新增 `agents` 表、`settings` 表
- [ ] `server.ts` 新增 CRUD 路由：
  - `GET /api/agents` — 列出所有智能体
  - `POST /api/agents` — 创建智能体
  - `GET /api/agents/:id` — 获取单个
  - `PUT /api/agents/:id` — 更新智能体
  - `DELETE /api/agents/:id` — 删除（is_preset=1 时拒绝）
  - `GET /api/settings` — 获取全部设置（敏感字段脱敏返回）
  - `PUT /api/settings/:key` — 更新单个设置项
- [ ] DB 初始化时种入 4 个预设智能体：
  - `续写助手`：擅长情节推进，第三人称，保持风格连贯
  - `润色助手`：专注文字润色，不改变情节
  - `审阅助手`：发现逻辑漏洞、节奏问题、人物性格不一致
  - `角色对话生成`：模拟角色语气进行对话生成

**前端任务**：
- [ ] 左侧主导航新增「设置」入口（齿轮图标，底部固定）
- [ ] 设置页 — LLM Provider 选择器（OpenAI / Ollama / Anthropic）
- [ ] 设置页 — API Key 输入（显示为 `***` 已设置 / 空输入框）
- [ ] 设置页 — 模型地址（Ollama 用，默认 `http://localhost:11434`）
- [ ] 智能体列表页 — 卡片展示，内置预设标签，用户自建可删除
- [ ] 新建/编辑智能体弹窗（名称 + 描述 + System Prompt textarea + 选择模型）

---

### P1 — 项目创建 + 项目路由

**目标**：用户可创建新项目，点击项目进入详情页，详情页有四个子模块导航。

**后端任务**：
- [ ] `GET /api/projects` 响应增加 `wordCount` 聚合（sum of chapters.word_count）

**前端任务**：
- [ ] 项目列表页新增「新建项目」按钮
- [ ] 新建项目弹窗（名称必填 + 题材/类型选填 + 简介选填）
- [ ] 前端路由状态扩展：`{ view: 'projects' | 'project-detail', projectId?: string }`
- [ ] 项目详情页框架：二级导航 `章节 / 角色 / 设定 / AI助手`
- [ ] 项目详情页 Header：项目名 + 返回按钮 + 总字数

---

### P2 — 章节管理

**目标**：在项目内管理章节列表，可编辑章节内容，右侧 AI 面板可折叠。

**后端任务**：
- [ ] 章节 API 已完整，无需新增

**前端任务**：
- [ ] 章节列表：排序拖拽、状态标签（草稿/完稿/修订中）、字数显示
- [ ] 新建章节按钮 + 弹窗（标题）
- [ ] 章节内容页：简单 `<textarea>` 全屏编辑，自动保存（debounce 1s）
- [ ] AI 内联面板（右侧，可折叠）：
  - 选择当前项目绑定的智能体
  - 快捷操作按钮：续写 / 润色 / 扩写 / 压缩
  - 对话流显示（streaming 支持，使用 SSE 或轮询）
  - 生成结果「插入到末尾」/「替换选中」操作

---

### P3 — 角色管理

**目标**：管理项目内角色，卡片列表 + 详情抽屉。

**后端任务**：
- [ ] 角色 API 已完整，无需新增

**前端任务**：
- [ ] 角色列表：卡片式（名称 + 角色类型 badge + 简短描述预览）
- [ ] 新建角色按钮 + 弹窗
- [ ] 角色详情抽屉（右侧滑入）：
  - 名字、角色类型（主角/配角/反派/路人）
  - 描述、性格特征（tag 输入）、背景故事
  - 编辑/删除操作

---

### P4 — 项目级 AI 助手

**目标**：多智能体对话，可引用项目内章节/角色/设定作为上下文。

**后端任务**：
- [ ] `schema.ts` 新增 `conversations` 表（存储对话历史，关联 project_id + agent_id）
- [ ] `GET /api/projects/:id/conversations` — 对话列表
- [ ] `POST /api/projects/:id/conversations` — 新建对话
- [ ] `POST /api/conversations/:id/messages` — 发送消息（调用 Mastra agent.generate）
- [ ] Agent 调用时将引用的章节/角色内容注入 system context

**前端任务**：
- [ ] AI 助手页面：左侧对话列表 + 右侧对话主区域
- [ ] 智能体选择器（从项目绑定的智能体中选）
- [ ] 上下文引用选择器（引用哪些章节/角色/设定片段）
- [ ] 对话消息流（Markdown 渲染，代码块语法高亮）
- [ ] 消息发送/停止生成

---

### P5 — 设定管理（AI 优先，当前阶段只展示）

**目标**：世界观/大纲/时间线三个子模块，内容由 AI 生成，当前阶段只做展示界面。

**后端任务**：
- [ ] 在 `notes` 表 `category` 字段约定分类：`worldbuilding` / `outline` / `timeline`
- [ ] 可复用现有 notes CRUD API

**前端任务**：
- [ ] 设定页三 Tab：世界观 / 大纲 / 时间线
- [ ] 世界观 Tab：key-value 条目展示（标题 + 内容卡片，可 AI 生成填充）
- [ ] 大纲 Tab：层级树展示（卷/篇/章节点，可展开/折叠）
- [ ] 时间线 Tab：事件卡片按时间顺序排列

---

### P6 — 项目级智能体配置

**目标**：为每个项目配置多智能体组合（续写/审阅/角色对话分工）。

**后端任务**：
- [ ] `schema.ts` 新增 `project_agents` 表（见上方 Schema 定义）
- [ ] `GET /api/projects/:id/agents` — 列出项目绑定的智能体
- [ ] `POST /api/projects/:id/agents` — 绑定智能体到项目（指定角色 + 风格补充）
- [ ] `PUT /api/project-agents/:id` — 更新绑定配置
- [ ] `DELETE /api/project-agents/:id` — 解绑

**前端任务**：
- [ ] 项目设置页（项目详情内的「设置」子项）
- [ ] 智能体配置区：从全局智能体选择，分配项目角色
- [ ] 每个绑定可设置写作风格补充、人称、语气

---

## 技术约束与规范

### 后端规范
- 所有新路由遵循现有 `sendJson / readBody` 模式，不引入新框架
- DB 变更通过修改 `schema.ts` + 更新 `db.ts` 的 `bootstrap` 逻辑（Drizzle push）
- 预设数据在 `initDb()` 完成后通过 `INSERT OR IGNORE` 种入

### 前端规范
- 不引入 React Router，继续使用 state-based 路由（扩展现有 `activeNav` 模式）
- 不引入全局状态管理库（Zustand/Redux），继续用 `useState` + props
- 组件内联在 App.tsx 或拆分到 `apps/web/src/components/` 目录
- 样式只用 Tailwind CSS v4 CSS 变量 token，不写内联 style（除非动态值）
- 弹窗/抽屉统一用 Headless UI `Dialog` + `Transition`

### AI 调用规范
- 所有 AI 调用走 `/api/agents/:id/generate`（现有接口）
- 项目上下文注入方式：在 `messages` 数组首位插入 `{ role: 'system', content: <context> }`
- Streaming 待后续实现，当前阶段用轮询/一次性响应

---

## 文件变更索引

| 文件 | 涉及阶段 | 变更类型 |
|------|---------|---------|
| `packages/mastra/src/db/schema.ts` | P0, P4, P6 | 新增表定义 |
| `packages/mastra/src/db/db.ts` | P0 | 新增预设种入逻辑 |
| `packages/mastra/src/server.ts` | P0, P4, P6 | 新增路由 |
| `packages/mastra/src/mastra.ts` | P0 | 动态从 DB 读取 Agent 配置 |
| `apps/web/src/App.tsx` | P0–P6 | 逐步拆分组件，扩展路由状态 |
| `apps/web/src/components/` | P0–P6 | 新增各功能组件 |
