# Novel Local Studio — 功能现状

> 最后更新：2026-04-03（建书后 AI 自动初始化世界设定、角色统一为世界设定、渐进式大纲生成、智能体提示词重写）

---

## 产品定位

**AI 为主的小说编辑器**——基本不考虑人类写作，AI 负责生成，人类只做基础修改。侧边栏导航分两级：书库级（书架列表）和工作台级（进入某本书后的七个功能区）。

---

## AI 生成小说——完整流程

> **核心理念**：用户通过与 AI 对话来创建和管理小说，而非手动填写表单。整个流程分为「创建书籍 → 进入工作台 → 多智能体协作」三个阶段。
>
> 多智能体协作的详细流程设计见 [docs/roadmap.md](roadmap.md)（Supervisor 模式，待实施）。

### 当前已完成步骤

```
步骤 1 ✅ 创建书籍（AI 或手动）
步骤 2 ✅ 对话绑定到书籍（projectId 隔离）
步骤 3 ✅ 进入工作台，继续通过左侧 AI 面板创作
步骤 4 ✅ 切换智能体（在同一对话中切换不同专家）
步骤 5 ✅ 世界观构建基础页（分类 + 设定 CRUD，支持 AI 上下文联动）
步骤 6 ⬜ 角色设计（角色统一为世界设定「角色」分类，AI 通过 createWorldSetting/updateWorldSetting 管理）
步骤 7 ✅ 大纲规划基础页（独立 outlines 数据结构，卷 → 章节节点）
步骤 8 ✅ 逐章写作基础页（章节列表 + 正文编辑保存）
步骤 9 ⬜ 审阅润色（AI 审查逻辑一致性、文字润色）
步骤 10 ⬜ 阅读导出（干净阅读视图 + 导出）
```

### 步骤 1：创建书籍

**入口**：点击 BookSidebar 的 `+` 按钮，导航到 `/new-book`（新书引导页）。

**两种创建方式**：

#### A. AI 创建（推荐）

1. 用户在 AI 对话面板描述想法（如「帮我构思一部玄幻小说」）
2. 智能体锁定为「导演」（`preset-director`），不可切换
3. 由于此时无 `bookId` 上下文，后端仅暴露 `createProject` 工具，`maxSteps` 降至 3 防止工具调用循环
4. AI 构思完毕后调用 `createProject` 工具，传入 `name`/`synopsis`/`genre`
5. `useChatRuntime` 的 `onFinish` 回调检测到 `createProject` 工具输出（使用 `ai` SDK 的 `isToolUIPart()` + `getToolName()` 匹配 static 和 dynamic 两种 tool part 类型）
6. `onFinish` 中 `await PUT /api/conversations/:threadId` 将当前对话绑定到新书 `projectId`
7. 调用 `onBookCreated(bookId, conversationId)`，刷新书架列表 + 自动选中新书
8. 前端额外补发一次 `/api/projects/:id/world/initialize` 作为兜底重试，确保世界设定初始化被触发
9. 导航到 `/books/:bookId/overview`，携带 `{ conversationId, agentId: 'preset-director' }` 状态
10. 工作台加载，左侧 AI 面板继续沿用该对话，预选「导演」智能体；后端异步用 Director 为新书生成分类与初始设定

**数据流**：
```
NewBookPage
  → AIChatPanel (agentLocked=导演, 无 bookId)
  → ensureThreadId() 创建对话线程 (无 projectId)
  → AI 对话，构思小说（maxSteps=3，系统提示限制仅 createProject）
  → AI 调用 createProject 工具（insert 含 archived=0）
  → onFinish 回调：isToolUIPart(part) + getToolName(part) === 'createProject'
  → await PUT 绑定 projectId → onBookCreated(bookId, convId)
  → POST /api/projects/:bookId/world/initialize（前端兜底触发）
  → navigate /books/:bookId/overview
  → BookWorkspaceLayout mount → 左侧 AI 面板继续该对话
```

#### B. 手动创建

1. 用户切换到「手动创建」Tab，填写书名（必填）、类型、简介
2. `POST /api/projects` 创建书籍（响应 `{ project }`）
3. 前端补发 `POST /api/projects/:id/world/initialize` 作为兜底重试
4. 导航到 `/books/:bookId/overview`（概览页）

### 步骤 2：对话按书籍隔离

- 每个书籍只显示自己的 AI 对话历史（通过 `projectId` 过滤）
- `ConversationsSidebar` 优先使用 `projectId` 查询，仅在无 `projectId` 时回退到 `agentId` 查询
- 后端 `GET /api/conversations?projectId=xxx` 通过 `metadata.projectId` 过滤，不限制 `resourceId`（即同一本书的不同智能体对话都会显示）

### 步骤 3：工作台 AI 对话

进入书籍后，工作台左侧常驻 AI 面板提供完整的 AI 对话能力：

- 左侧：该书籍的对话历史列表（按 `projectId` 隔离）
- 右侧：聊天区域（消息列表 + 输入框 + 智能体/模型选择）
- 此时有 `bookId` 上下文，AI 可以使用所有对应工具

### 步骤 4：切换智能体

- 在同一对话中可自由切换智能体（如从「导演」切换到「世界观构建」）
- 切换智能体**不会**清空当前对话，仅改变下一次 AI 回复使用的角色和工具集
- 下一条消息将使用新智能体的 System Prompt + 工具权限

### 步骤 5-10：当前进度

- 世界设定页已可用：分类 CRUD、设定 CRUD、页面上下文注入、从设定详情页一键把更新要求发送给 AI
- **建书后 AI 自动初始化 world**：不再预置默认分类；项目创建后由 Director 自动生成 4-8 个贴合题材的分类与 2-4 条初始设定
- **角色统一管理**：角色作为世界设定「角色」分类（`wst-characters`）的条目管理，不再使用独立角色表。AI 通过 `createWorldSetting`/`updateWorldSetting` 创建和更新角色，内容采用 Markdown 结构化模板（基础信息、性格特质、当前状态、持有物品、已学技能、人物关系等），随剧情推进动态更新
- **渐进式创作流程**：智能体提示词已重写为五阶段渐进流（粗纲 → 设定 → 细纲 → 写作 → 设定同步），导演负责统筹调度，写作完成后自动触发设定变更同步
- 大纲页已可用：独立于正文章节的数据结构，支持卷/章节大纲树、折叠、内联编辑、删除、新增
- 写作页已可用：章节列表 + 单章正文编辑 + 保存
- 角色、审阅、阅读的深度 AI 工作流仍待继续补全（角色管理已迁移至世界设定，UI 适配待跟进）

---

## 当前开发优先级

> **第一优先级（当前迭代）**：AI 对话 + 创建流程 ✅
> - ✅ AI 面板布局重构（嵌入式三栏）
> - ✅ Vercel AI SDK 接入
> - ✅ 多智能体系统（10 个预置）
> - ✅ 对话记录管理（按书籍隔离）
> - ✅ AI 创建书籍完整流程（含对话绑定）
> - ✅ 归档功能
>
> **第二优先级（当前进行中）**：工作台页面深度化（角色、审阅、阅读、更多 AI 工作流）

---

## 已实现功能

### 启动流（Bootstrap）

前端启动时依次执行：

1. **健康检查** `GET /health` — 轮询直到 `status: ok`
2. **并行初始化** — 同时请求四个端点，全部 2xx 才进入主界面：
   - `GET /api/shell` — 应用元信息
   - `GET /api/projects` — 初始项目列表
   - `GET /api/mastra` — Mastra 可达性
   - `GET /api/bootstrap` — 启动阶段 + 日志

启动画面显示阶段（`starting / checking-backend / ready`）、API 地址、日志列表，任意步骤失败后 800ms 自动重试。

---

### 导航 & 页面路由

| 路由 | 页面组件 | 状态 |
|---|---|---|
| `/` | `AppLayout`（BookSidebar + AIChatPanel） | ✅ 实现 |
| `/new-book` | `NewBookPage`（新书引导页） | ✅ 实现 |
| `/books/:bookId/overview` | `OverviewPage` | 占位 |
| `/books/:bookId/world` | `WorldPage` | ✅ 实现 |
| `/books/:bookId/world/settings/new` | `WorldSettingPage` | ✅ 实现 |
| `/books/:bookId/world/settings/:settingId` | `WorldSettingPage` | ✅ 实现 |
| `/books/:bookId/outline` | `OutlinePage` | ✅ 实现 |
| `/books/:bookId/writing` | `WritingPage` | ✅ 实现 |
| `/books/:bookId/review` | `ReviewPage` | 占位 |
| `/books/:bookId/reading` | `ReadingPage` | ✅ 基础实现 |
| `/settings/llm` | `LLMConfigPage` | ✅ 实现 |
| `/settings/agents` | `AgentsPage` | ✅ 实现 |
| `/settings/archived` | `ArchivedBooksPage` | ✅ 实现 |
| `/settings/memory` | `MemoryConfigPage` | ✅ 实现 |

---

### 书库管理（BookSidebar 图标导航）

- 全局固定 56px 窄侧栏（`BookSidebar` 组件），常驻于页面左侧
- 每本书显示为彩色圆角方块（首字母 + 基于 ID 的哈希颜色），当前书籍高亮（`ring-2`）
- Hover 展示 HoverCard 详情（书名、类型、简介）+ 归档按钮
- 点击书籍图标进入工作台（`/books/:id/overview`）
- **新建书籍**：点击虚线 `+` 按钮导航到 `/new-book` 引导页
- **归档书籍**：Hover 书籍显示归档按钮，点击后二次确认（需输入「确认归档」），归档后从书架隐藏
- **底部区域**：主题切换按钮（dark/light）、设置入口、健康状态指示灯（点击打开服务详情 Dialog）
- 删除书籍级联删除章节 / 角色 / 笔记

---

### 新书引导页（`/new-book`）

两种创建方式的 Tab 切换界面：

- **手动创建 Tab**：书名（必填）+ 类型 + 简介表单，提交后 `POST /api/projects` 创建并导航到概览页，同时异步触发世界设定初始化
- **AI 创建 Tab**：嵌入 `AIChatPanel`（500px 高），智能体锁定为「导演」，AI 对话完成后自动创建书籍、绑定对话，并异步触发世界设定初始化

---

### 工作台内嵌 AI 对话区

进入书籍后，AI 面板固定在工作台左侧，页面内容显示在右侧：

- **左区顶部**：AI 标题栏 + 对话历史开关
- **左区主体**：`AIChatPanel`，支持智能体切换、模型切换、工具流展示
- **可选对话历史栏**：展开后按 `projectId` 过滤，只显示当前书籍的会话
- **右区内容页**：概览 / 世界设定 / 提纲 / 写作 / 审阅 / 阅读

`/books/:bookId/chat` 当前会重定向回工作台主视图，不再作为独立内容页承载主要聊天体验。

---

### 归档功能

- **归档操作**：BookSidebar 中 hover 书籍显示归档按钮，点击后弹出确认对话框，需输入「确认归档」才能执行
- **归档效果**：书籍从书架隐藏（`archived = 1`），不参与正常列表
- **已归档书籍管理**：`/settings/archived` 页面显示所有已归档书籍，支持恢复（取消归档）
- **后端支持**：`PUT /api/projects/:id/archive` 归档，`PUT /api/projects/:id/unarchive` 恢复

---

### 世界设定（`/books/:bookId/world`）

- **AI 初始化优先**：书籍创建后由 Director 异步生成首批分类与初始设定，不再存在固定默认 12 类 seed
- **分类管理**：左侧边栏显示所有类型；当 AI 尚未生成完成时显示“初始化中”，失败时显示错误与“让 AI 生成分类”重试按钮
- **类型 CRUD**：新建自定义类型（图标 + 名称 + 说明），编辑 / 删除自定义类型（当前类型均为普通类型，可删除）
- **设定条目 CRUD**：每条设定含标题 / 摘要 / 详细内容（Markdown）/ 标签，新建 / 编辑在独立详情页完成，列表卡片 hover 显示编辑 / 删除
- **AI 检索优化**：`summary` 字段供 AI 快速扫描，`tags` 为 JSON 字符串数组便于过滤
- **页面上下文注入**：切换激活分类时自动更新 `AIChatContext` 的 `pageContext`（携带 bookId / typeId / typeName），AI 面板据此显示当前分类标签并自动推荐世界设定相关智能体
- **章节应用入口**：在设定详情页点击「应用到章节」，会将当前设定的变更要求写入 AI 待发送消息，回到世界设定页后可直接让 AI 执行章节同步
- **失败兜底**：即使初始化失败，用户也可手动新建分类继续工作；系统同时保留“让 AI 自动生成”重试入口

---

### 大纲（`/books/:bookId/outline`）

- **独立数据模型**：大纲使用单独的 `outlines` 表，不再复用 `chapters`
- **两级结构**：卷（`volume`）→ 章节大纲节点（`chapter`）
- **交互能力**：折叠/展开卷、内联编辑标题/简介/状态、删除卷或节点、快速新增卷、快速新增章节大纲
- **状态标记**：支持 `draft` / `done`
- **AI 上下文**：页面设置 `pageKey: 'outline'`，方便 AI 聚焦大纲规划而不是正文改写

---

### 写作（`/books/:bookId/writing`）

- **章节列表**：左侧展示项目章节，按 `order` 排序
- **正文编辑**：右侧 textarea 编辑正文
- **保存能力**：点击保存后调用 `PUT /api/chapters/:id`，自动刷新字数和内容
- **当前形态**：这是面向 AI 主写、人类小改的基础编辑器，不含复杂富文本能力

---

### 阅读（`/books/:bookId/reading`）

- 已有基础阅读页与导出入口
- 当前仍属于基础实现，后续可继续补强排版、章节导航和导出格式

---

### LLM Provider 配置（`/settings/llm`）

- 添加 / 编辑 / 删除 Provider
- 支持 `openai` / `anthropic` / `ollama` / `custom` 类型
- 实时拉取 Provider 的模型列表（`/api/providers/:id/models`）
- `enabled` 开关切换启用状态
- API Key 在所有 GET 响应中脱敏；`PUT` 传 `***` 不覆盖已存密钥
- 预置 Provider 不可删除

---

### 智能体管理（`/settings/agents`）

- 列表展示所有智能体（按 统筹调度/前期策划/写作执行/质量把控/自定义 分类）
- 新建 / 编辑（名称、描述、System Prompt、模型、Provider）/ 删除
- 预置智能体不可删除（返回 403）

---

### AI 对话面板（AIChatPanel 组件）

> 核心 AI 交互组件，在首页全屏展示，在 `/new-book` AI 创建 Tab 内嵌，在书籍工作台左侧常驻展示。

- 可选对话历史列表 + 主聊天区（消息列表、智能体/模型选择器、页面专属快速提示词）
- 全局上下文感知（`AIChatContext` 注入 `pageContext`），智能体锁定、自动预选、meta 透传
- 工具调用状态实时显示（⏳/✅/❌），`createProject` 完成后自动绑定对话、导航，并补发 world 初始化请求作为前端兜底
- 基于 `@assistant-ui/react-ai-sdk` 的 `useChatRuntime` + `AssistantChatTransport`

> 组件结构、Props、数据流等技术细节见 [architecture.md — AI 对话面板架构](architecture.md#ai-对话面板aichatpanel架构)

---

### 对话记录管理

AI 面板左侧的对话列表提供完整的会话管理：

- **列表展示**：按书籍隔离（`projectId`），无 `projectId` 时按 `agentId` 过滤
- **新建对话**：点击「+」按钮开始新对话，发送第一条消息后自动以消息内容前 30 字命名
- **切换对话**：点击列表项，从后端加载完整消息历史并渲染
- **重命名对话**：hover 显示编辑图标，点击进入编辑模式，回车/失焦保存
- **删除对话**：hover 显示删除图标，点击后 inline 二次确认，确认后删除
- **对话绑定**：AI 创建书籍时，对话通过 `PUT /api/conversations/:id` 绑定 `projectId`
- **会话持久化**：所有消息通过 `@mastra/memory` LibSQLStore 持久化，重启后仍可恢复

---

### 多智能体系统

10 个预置智能体（`isPreset=1`，不可删除），按职责分为四类：统筹调度（导演）、前期策划（世界观/角色/大纲/章节规划）、写作执行（写作/对话）、质量把控（润色/审阅/读者视角）。每个智能体按最小权限原则分配工具子集。

- **专用 System Prompt**：每个 agent 有深度定制的指令（定义在 `db.ts`），核心五个智能体（导演、世界观构建、角色设计、大纲规划、写作执行）已重写为渐进式创作流
- **角色统一为世界设定**：角色设计师通过 `createWorldSetting`/`updateWorldSetting` 在「角色」分类下管理角色，写作执行完成后通过 `updateWorldSetting` 同步设定变更
- **页面联动推荐**：world 页面推荐世界观构建、outline 页面推荐大纲规划等
- **用户自定义 agent**：用户可在 `/settings/agents` 新建，自定义 agent 拥有所有工具权限

---

### 记忆系统设置（`/settings/memory`）

- **Embedding 模型配置**：支持本地 `fastembed` 或远程 `provider/model`
- **OM 模型配置**：可配置 `memory.om_model`
- **数据存储**：通过 `/api/settings/memory.embedder_model` 与 `/api/settings/memory.om_model` 写入设置表
- **当前生效方式**：保存后重启应用生效

> 完整智能体列表、工具权限分配表见 [architecture.md — 多智能体系统架构](architecture.md#多智能体系统架构)

---

### UI / 设计系统

- **组件库**：shadcn/ui（基于 Radix UI 原语 + Tailwind CSS），组件位于 `components/ui/`
- **主题**：支持 dark/light/system 切换（`ThemeProvider`），CSS 变量定义在 `app/src/index.css` 的 `@theme {}` 块
- **色彩**：`--color-ink-*`（近黑背景）、`--color-parchment-*`（暖白前景）、`--color-amber-*`（琥珀金强调）
- **字体**：Playfair Display（标题）+ Source Serif 4（正文）+ 等宽字体（代码 / 元信息）
- **全局侧栏**：BookSidebar（56px 固定），书籍图标列表 + 新建/设置/健康状态
- **工作台/设置页导航**：shadcn Sidebar 组件（`collapsible="offcanvas"`），14rem 宽，支持折叠
- **工作台顶栏**：书名 + Shell 版本 + AI 状态指示灯（就绪/离线）

---

## 尚未实现（占位 / 待开发）

| 功能 | 优先级 | 说明 |
|---|---|---|
| 工作台：概览 | 🟡 中 | 书籍统计信息页，后端 API 已就绪 |
| 工作台：提纲深度化 | 🟡 中 | 当前已支持卷/章节树与基础编辑，待补更多 AI 工作流与拖拽能力 |
| 工作台：写作增强 | 🟡 中 | 当前已支持基础正文编辑保存，待补更多 AI 辅助写作能力 |
| 工作台：审阅 | 🟡 中 | AI 全文扫描逻辑/一致性/节奏 |
| 工作台：阅读增强 | 🟡 中 | 当前已有基础阅读/导出，待优化版式与交互 |
| 向量检索 | 🟢 低 | 当前仍未实现；若后续重启该能力，需要重新引入独立 schema 与路由 |
| WebSocket 实时推送 | 🟢 低 | 目前任务状态为轮询 |
| 后台托盘菜单 | 🟢 低 | Tauri 托盘功能未实现 |
| 局域网 / 移动端配对 | 🟢 低 | 未实现 |
