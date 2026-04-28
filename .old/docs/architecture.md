# Novel Local Studio — 架构说明

> 最后更新：2026-04-03（建书后 AI 自动初始化世界设定、工作台内嵌 AI 布局、outlines 独立数据结构）

---

## 层次结构

```
Tauri 桌面壳 (app)
  └─ Rust · Axum · 127.0.0.1:4311
       │ 反向代理 /api/* → Mastra sidecar
       ▼
React 前端 (app)  ←─→  Mastra sidecar (mastra)
                          Node.js · Hono · 127.0.0.1:4312
                          SQLite via Drizzle ORM
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui + Radix UI |
| 前端 AI | `@assistant-ui/react`（`useChatRuntime` + `AssistantChatTransport`）+ `@assistant-ui/react-ai-sdk` + `ai`（类型 + UIMessage） |
| 后端 | Hono（模块化路由）+ `MastraServer.registerContextMiddleware()` |
| 后端 AI | Mastra Agent（`handleChatStream()` / `agent.stream()` + `toAISdkStream()`），自动处理 tool call 循环 |
| 数据库 | SQLite，`@libsql/client` + Drizzle ORM，零配置自动建表 |
| AI 记忆 | `@mastra/core` + `@mastra/memory`（LibSQLStore），线程 + 消息持久化 |
| 桌面壳 | Tauri v2，生产模式内嵌 Mastra 二进制为 sidecar |

---

## 布局架构

### 两栏全局布局

根布局 `AppLayout` 分为固定窄侧栏 + 右侧内容区：

```
┌────────┬──────────────────────────────────────────────────┐
│        │                                                  │
│  Book  │   Content Area                                   │
│ Sidebar│   （根据路由切换）                                │
│  56px  │                                                  │
│  固定  │   无 bookId → 全屏 AIChatPanel                   │
│        │   /new-book → NewBookPage（引导页）               │
│  书籍  │   有 bookId → BookWorkspaceLayout                │
│  图标  │   /settings → SettingsLayout                     │
│  导航  │                                                  │
│        │                                                  │
└────────┴──────────────────────────────────────────────────┘
```

### BookWorkspaceLayout 内部（进入具体书籍后）

当前工作台是“三栏变体”：左侧 AI 面板、中间内容页、右侧书籍内导航。AI 不再依赖单独 `/chat` 页面，而是常驻在工作台左侧。

```
┌────────┬─────────────────────┬───────────────────┬──────────────┐
│        │  AI Panel           │  Content Panel    │ Workspace    │
│  Book  │  (可展开对话历史)     │  (Outlet)         │ Sidebar      │
│ Sidebar│  AIChatPanel 常驻    │  当前页面内容       │ 可折叠        │
│  56px  │  ConversationsSidebar│  概览/世界/提纲/   │ 书内导航      │
│        │                     │  写作/审阅/阅读    │              │
└────────┴─────────────────────┴───────────────────┴──────────────┘
```

### SettingsLayout 内部

同样使用 `SidebarProvider`，左侧为设置导航菜单（LLM 配置 / 智能体管理 / 已归档书籍），右侧为设置页面内容。

### 首页（无 bookId）

当用户未选中任何书籍时（根路径 `/`），`AppLayout` 隐藏 `Outlet`，直接全屏展示 `AIChatPanel`，用户可通过 AI 对话创建新书籍。

---

## 前端目录结构

```
app/src/
├── App.tsx              # Bootstrap 逻辑（健康检查 + 初始化轮询）+ AppLayoutWrapper
├── main.tsx             # 路由注册入口（createBrowserRouter）
├── types.ts             # 全局共享类型（Health, Project, AgentConfig, Provider 等）
├── index.css            # Tailwind CSS v4 主题变量（@theme 块）
├── vite-env.d.ts        # Vite 类型声明
├── contexts/
│   └── AIChatContext.tsx       # AI 助手全局状态（pageContext, activeBookId, activeConversationId 等）
├── hooks/
│   └── use-mobile.ts          # 移动端检测 hook（供 shadcn sidebar 使用）
├── lib/
│   ├── api.ts                 # API_BASE 常量（读取 VITE_API_BASE_URL 环境变量）
│   └── utils.ts               # cn() 工具函数（clsx + tailwind-merge）
├── layouts/
│   ├── AppLayout.tsx           # 主壳：BookSidebar + 内容区（有 bookId 时 Outlet，无时 AIChatPanel）
│   ├── BookWorkspaceLayout.tsx # 工作台壳：WorkspaceSidebar + SidebarInset + Header + Outlet
│   └── SettingsLayout.tsx      # 设置页壳：SettingsSidebar + SidebarInset + Header + Outlet
├── pages/
│   ├── NewBookPage.tsx         # /new-book（新书引导页：手动创建 / AI 创建 Tab）
│   ├── workspace/
│   │   ├── OverviewPage.tsx    # /books/:bookId/overview
│   │   ├── WorldPage.tsx       # /books/:bookId/world（✅ 已实现）
│   │   ├── OutlinePage.tsx     # /books/:bookId/outline（✅ 已实现）
│   │   ├── WritingPage.tsx     # /books/:bookId/writing（✅ 基础实现）
│   │   ├── ReviewPage.tsx      # /books/:bookId/review
│   │   ├── ReadingPage.tsx     # /books/:bookId/reading（✅ 基础实现）
│   │   ├── WorldSettingPage.tsx # 世界设定详情/编辑页
│   │   └── ChatPage.tsx        # 旧聊天页实现保留，主工作流已改为内嵌 AI 面板
│   └── settings/
│       ├── LLMConfigPage.tsx   # /settings/llm
│       ├── AgentsPage.tsx      # /settings/agents
│       ├── ArchivedBooksPage.tsx # /settings/archived（已归档书籍管理）
│       ├── MemoryConfigPage.tsx # /settings/memory（记忆系统模型配置）
│       ├── ProviderFormDialog.tsx  # Provider 新建/编辑弹窗
│       └── AgentFormDialog.tsx    # Agent 新建/编辑弹窗
└── components/
    ├── AIChatPanel.tsx     # AI 对话面板（核心组件，791 行）
    │                       #   ├── ConversationsSidebar（对话列表，按 projectId 隔离）
    │                       #   └── RuntimeThread（useChatRuntime + AssistantChatTransport）
    ├── assistant-ui/       # @assistant-ui/react 定制组件
    │   ├── thread.tsx             # 对话线程渲染（消息列表 + 输入区）
    │   ├── markdown-text.tsx      # Markdown 消息渲染
    │   ├── attachment.tsx         # 附件处理
    │   ├── tool-fallback.tsx      # 工具调用 UI（运行中/完成/错误/取消状态）
    │   └── tooltip-icon-button.tsx # 工具提示图标按钮
    ├── BookSidebar.tsx     # 全局固定窄侧栏（56px），书籍图标 + 归档 + 新建/设置/状态
    ├── WorkspaceSidebar.tsx # 工作台左侧导航（概览/世界/提纲/写作/审阅/阅读/AI对话）
    ├── SettingsSidebar.tsx  # 设置页左侧导航（LLM 配置/智能体管理/已归档书籍）
    ├── icons.tsx           # SVG 图标集合
    ├── PlaceholderView.tsx # 占位页通用组件
    ├── StatusRow.tsx       # 状态行 UI 原子
    ├── theme-provider.tsx  # 主题 Context Provider（dark/light/system）
    ├── theme-toggle.tsx    # 主题切换按钮（月亮/太阳图标）
    └── ui/                 # shadcn/ui 基础组件库
        ├── alert-dialog.tsx
        ├── avatar.tsx
        ├── badge.tsx
        ├── button.tsx
        ├── card.tsx
        ├── collapsible.tsx
        ├── dialog.tsx
        ├── hover-card.tsx
        ├── input.tsx
        ├── label.tsx
        ├── select.tsx
        ├── separator.tsx
        ├── sheet.tsx
        ├── sidebar.tsx
        ├── skeleton.tsx
        ├── tabs.tsx
        ├── textarea.tsx
        └── tooltip.tsx
```

**分层规则**：

- `contexts/` — React Context + Provider，管理跨组件全局状态
- `hooks/` — 自定义 React hooks
- `lib/` — 纯工具函数、常量（无 React 依赖）
- `layouts/` — 包含 `<Outlet />` 的布局壳，负责导航 / 容器，不承载业务逻辑
- `pages/` — 路由级页面组件，按路由路径命名
- `components/` — 跨页面复用的 UI 组件
- `components/ui/` — shadcn/ui 基础原子组件（由 CLI 生成，不手动修改）

---

## 路由结构

```
/                          → AppLayout（BookSidebar + AIChatPanel 全屏）
/new-book                  → NewBookPage（新书引导页：手动/AI 创建）
/books/:bookId             → BookWorkspaceLayout（工作台壳）
  /books/:bookId           → redirect /books/:bookId/overview
  /books/:bookId/overview  → OverviewPage
  /books/:bookId/world     → WorldPage
  /books/:bookId/world/settings/new → WorldSettingPage
  /books/:bookId/world/settings/:settingId → WorldSettingPage
  /books/:bookId/outline   → OutlinePage
  /books/:bookId/writing   → WritingPage
  /books/:bookId/review    → ReviewPage
  /books/:bookId/reading   → ReadingPage
  /books/:bookId/chat      → redirect /books/:bookId
  /settings                  → redirect /settings/llm
  /settings/llm              → LLMConfigPage
  /settings/agents           → AgentsPage
  /settings/archived         → ArchivedBooksPage
  /settings/memory           → MemoryConfigPage
```

---

## BookSidebar 图标导航

全局固定 56px 窄侧栏（`BookSidebar` 组件），常驻于 `AppLayout` 左侧：

- **书籍图标列表**：每本书显示为彩色圆角方块（首字母 + 哈希颜色），hover 展示 HoverCard 详情（书名/类型/简介）+ 归档按钮
- **新建按钮**：虚线边框 `+` 图标，点击导航到 `/new-book`（新书引导页）
- **归档**：hover 书籍显示归档按钮，点击后弹出确认对话框（需输入「确认归档」）
- **底部区域**：主题切换按钮、设置入口、健康状态指示灯（点击打开状态详情 Dialog）
- **选中状态**：当前书籍显示 `ring-2` 高亮环

---

## AI 创建书籍流程（详细时序）

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  BookSidebar │    │  NewBookPage │    │  AIChatPanel │    │   Backend    │
│   (+ 按钮)   │    │  (引导页)    │    │  (AI 面板)   │    │  (Hono API)  │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │                   │
       │ navigate(/new-book)                   │                   │
       │──────────────────►│                   │                   │
       │                   │                   │                   │
       │                   │ setPageContext     │                   │
       │                   │ (agentLocked=导演) │                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │                   │ setOnBookCreated   │                   │
       │                   │ (callback)        │                   │
       │                   │──────────────────►│                   │
       │                   │                   │                   │
       │                   │     用户输入消息    │                   │
       │                   │                   │                   │
       │                   │                   │ POST /api/conversations
       │                   │                   │ (无 projectId)     │
       │                   │                   │──────────────────►│
       │                   │                   │  { id: threadId }  │
       │                   │                   │◄──────────────────│
       │                   │                   │                   │
       │                   │                   │ POST /api/chat/preset-director │
       │                   │                   │ (threadId, 无 bookId)          │
       │                   │                   │──────────────────►│
       │                   │                   │                   │
       │                   │                   │  SSE: text-delta...│
       │                   │                   │◄──────────────────│
       │                   │                   │                   │
       │                   │                   │  SSE: tool-input   │
       │                   │                   │  (createProject)   │
       │                   │                   │◄──────────────────│
       │                   │                   │                   │
       │                   │                   │  SSE: tool-output  │
       │                   │                   │  { id: bookId }    │
       │                   │                   │◄──────────────────│
       │                   │                   │                   │
       │                   │                   │ 检测到 createProject│
       │                   │                   │ 输出（onFinish 回调 │
       │                   │                   │ isToolUIPart +     │
       │                   │                   │ getToolName）       │
       │                   │                   │                   │
       │                   │                   │ PUT /api/conversations/:threadId
       │                   │                   │ { projectId: bookId }
       │                   │                   │──────────────────►│
       │                   │                   │◄──────────────────│
       │                   │                   │                   │
       │                   │ onBookCreated(bookId, convId)         │
       │                   │◄──────────────────│                   │
       │                   │                   │                   │
       │ refreshProjects() │                   │                   │
       │◄──────────────────│                   │                   │
       │                   │                   │                   │
        │                   │ navigate(/books/:bookId/overview,     │
        │                   │   state: { conversationId, agentId }) │
        │                   │──────────────────────────────────────►│
       │                   │                   │                   │
        │                   │   工作台 mount     │                   │
        │                   │   → 左侧 AI 面板常驻                  │
        │                   │   → 读取 location state / 对话        │
        │                   │   → 用户继续对话                      │
       │                   │                   │                   │
       │                   │                   │ GET /api/conversations/:id
       │                   │                   │──────────────────►│
       │                   │                   │  { messages: [...] }
       │                   │                   │◄──────────────────│
       │                   │                   │                   │
       │                   │                   │ 渲染对话历史      │
       │                   │                   │ 用户继续对话...   │
```

---

## AI 对话面板（AIChatPanel）架构

当前主工作流中，`AIChatPanel` 被 `BookWorkspaceLayout` 固定放在左侧内容区，右侧 `Outlet` 承载当前页面内容；首页 `/` 与 `/new-book` 仍可独立嵌入该面板。

### 组件结构

```
<AIChatPanel withConversations? initialAgentId?>
  ├── <ConversationsSidebar>           # 左侧 160px（仅 withConversations=true）
  │   ├── 新建对话按钮
  │   └── 对话列表（按 projectId 或 agentId 过滤，可重命名/删除）
  └── <主内容区>                       # 右侧 flex-1
      ├── Header（AI 创作助手标题 + 页面上下文标签）
      ├── <RuntimeThread>              # 独立组件，key 随 runtimeKey 重建
      │   ├── AssistantRuntimeProvider（运行时容器）
      │   └── Thread（@assistant-ui/react 对话渲染）
      │       ├── Markdown 消息渲染（assistant-ui/markdown-text.tsx）
      │       ├── 工具调用状态（assistant-ui/tool-fallback.tsx — ⏳/✅/❌）
      │       └── Starter Prompts（无消息时显示，按 pageKey 定制）
      ├── 错误提示（localizeError 中文化）
      └── 底部工具栏
          ├── 智能体选择下拉（可锁定，按 pageContext.agentLocked）
          └── 模型选择下拉（按 provider/model 值选择）
```

### Props

| Prop | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `withConversations` | `boolean` | `false` | 是否显示左侧对话历史列表 |
| `initialAgentId` | `string` | — | 初始选中的智能体 ID（如从 AI 创建流程进入时传 `preset-director`） |

### 对话隔离逻辑

`ConversationsSidebar` 的查询策略：

```
有 projectId（activeBookId）→ GET /api/conversations?projectId=xxx
  → 返回该书籍下所有智能体的对话（不限 resourceId）

无 projectId → GET /api/conversations?agentId=xxx
  → 返回该智能体的所有对话
```

### 智能体切换行为

切换智能体时**不清空对话**：仅更新 `selectedAgentId` 和 `selectedModel`，保留当前消息和线程。下一条消息将使用新智能体的 System Prompt 和工具权限。

切换智能体时联动模型选择：根据新 agent 的 `model` 值直接解析 `provider/model` 前缀，不再依赖单独 provider 字段推导。

### AI SDK 接入

**前端**：使用 `@assistant-ui/react-ai-sdk` 的 `useChatRuntime` hook + `AssistantChatTransport`

```typescript
const transport = new AssistantChatTransport<UIMessage>({
  api: `${API_BASE}/api/chat`,
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      messages,
      memory: threadId ? { thread: threadId, resource: agentId } : undefined,
      data: context,
      model: selectedModel,
    },
    api: `${API_BASE}/api/chat/${agentId}`,
  }),
});
const runtime = useChatRuntime<UIMessage>({ transport });
```

对话 UI 由 `@assistant-ui/react` 的 `AssistantRuntimeProvider` + `Thread` 渲染，包含消息列表、工具调用状态（`tool-fallback.tsx`）、Markdown 渲染等。

**后端**：`POST /api/chat/:agentId`（`routes/chat.ts`），基于 Mastra Agent 原生能力：

1. 构建 `RequestContext`（agentId, bookId/projectId/typeId, context, model）
2. Preset agent → `handleChatStream({ mastra, agentId, params, defaultOptions, version: 'v6' })`
3. 动态 agent → `buildDynamicAgent()` → `agent.stream()` + `toAISdkStream(v6)`
4. `createUIMessageStreamResponse({ stream })` 包装为 SSE 响应
5. Mastra 内部自动处理 tool call 循环（默认 maxSteps: 25；无 bookId 上下文时降至 3）和 Memory 持久化

### createProject 自动检测与 world 初始化兜底

`RuntimeThread` 组件通过 `useChatRuntime` 的 `onFinish` 回调检测 `createProject` 工具完成。检测使用 `ai` SDK 导出的 `isToolUIPart()` + `getToolName()` helper，同时匹配 static（`type: 'tool-createProject'`）和 dynamic（`type: 'dynamic-tool'`）两种 tool UI part 类型：

```typescript
import { isToolUIPart, getToolName } from 'ai';

// useChatRuntime 的 onFinish 回调中：
onFinish: ({ messages }) => {
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        isToolUIPart(part) &&
        getToolName(part) === 'createProject' &&
        part.state === 'output-available'
      ) {
        const bookId = (part.output as { id?: string })?.id;
        // 1. PUT /api/conversations/:threadId 绑定 projectId
        // 2. POST /api/projects/:bookId/world/initialize（前端兜底触发）
        // 3. 调用 onBookCreated(bookId, conversationId)
      }
    }
  }
}
```

**为避免 stale closure 问题**，`onBookCreated` 和 `onProjectCreated` 回调通过 `useRef` 包裹，确保 `onFinish` 始终读取最新引用。

**防止重复创建**：`lastHandledBookIdRef` 记录已处理的 bookId，避免多 step 场景下重复触发导航。

**工具调用限制**：当 `preset-director` 在无 `bookId` 上下文时（`/new-book` 页面），后端将 `maxSteps` 从 25 降至 3，并在系统提示中追加规则禁止调用 `createProject` 以外的工具，防止 AI 在创建书籍后继续调用需要 `bookId` 的工具导致错误循环。

**world 初始化机制**：项目创建成功后，后端 `initializeProjectWorld(projectId)` 会异步调用 `preset-director.generate()`，让 Director 直接为新书生成 4-8 个分类与 2-4 条初始设定。前端在 AI 创建和手动创建两条链路上都会额外补发一次 `/api/projects/:id/world/initialize` 作为兜底重试。

---

## AI 助手上下文系统（AIChatContext）

`AIChatProvider` 挂载在 `App` 根，全局唯一。各页面通过 `useAIChat().setPageContext()` 向 `AIChatPanel` 注入当前页面信息。

### PageContext 结构

```ts
type PageContext = {
  label: string;               // 显示在面板 Header 的当前位置描述
  pageKey?: string;            // 用于 starter prompt 查找（'world' | 'writing' | 'outline' | 'characters' | 'review' | 'books'）
  meta?: Record<string, unknown>; // 透传给智能体 API 的 context 字段（bookId / typeId 等）
  recommendedAgentHint?: string;  // 智能体名称子串，面板据此自动预选匹配的 agent
  agentLocked?: boolean;          // 为 true 时锁定智能体选择器（如新书创建页强制使用导演）
};
```

### AIChatContextValue 完整状态

```ts
type AIChatContextValue = {
  pendingMessage: string | null;
  setPendingMessage: (msg: string | null) => void;
  clearPendingMessage: () => void;
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  activeBookId: string | null;             // AppLayout 同步当前选中书籍 ID
  setActiveBookId: (id: string | null) => void;
  onProjectCreated: (() => void) | null;
  setOnProjectCreated: (fn: (() => void) | null) => void;
  onBookCreated: ((bookId: string, conversationId: string | null) => void) | null;  // AI 创建书籍后回调（含对话 ID）
  setOnBookCreated: (fn: ((bookId: string, conversationId: string | null) => void) | null) => void;
};
```

### 使用约定

- 页面 mount 时调用 `setPageContext({ label, pageKey, meta, recommendedAgentHint })`
- 页面 unmount（useEffect cleanup）时调用 `setPageContext(null)` 清理
- 用户手动切换智能体后，`recommendedAgentHint` 不再触发自动跳转（直到页面切换重置）

---

## 多智能体系统架构

### 预置智能体定义（`mastra/src/db/db.ts`）

10 个预置 agent 在服务启动时 seed 到 `agents` 表（`isPreset=1`）。其中 `preset-director` 在 `mastra.ts` 中已作为 Supervisor Agent 挂载 5 个核心子智能体：`preset-worldbuilder`、`preset-character-designer`、`preset-outline-planner`、`preset-writer`、`preset-reviewer`。

| 类别 | ID | 名称 | 工具权限 |
|---|---|---|---|
| 统筹调度 | `preset-director` | 导演 | 项目 / 世界设定 / 角色 / 章节 / 大纲 / 章节同步 |
| 前期策划 | `preset-worldbuilder` | 世界观构建 | 世界设定 CRUD + 分类创建 + 大纲读取 + 角色读取 + 章节同步 |
| 前期策划 | `preset-character-designer` | 人物设计 | 世界设定 CRUD + 角色 CRUD + 大纲读取（角色统一为世界设定「角色」分类） |
| 前期策划 | `preset-outline-planner` | 大纲规划 | 大纲读写 + 章节 / 世界设定 / 角色读取 |
| 前期策划 | `preset-chapter-planner` | 章节规划 | 章节 + 大纲 + 世界设定 |
| 写作执行 | `preset-writer` | 写作执行 | 章节 CRUD + 大纲读取 + 世界设定读写 + 角色读取（写后同步设定变更） |
| 写作执行 | `preset-dialogue` | 对话专家 | 章节 + 角色 + 世界设定 只读 |
| 质量把控 | `preset-polisher` | 润色 | 章节 读取/更新 |
| 质量把控 | `preset-reviewer` | 审阅 | 章节 + 世界设定 + 角色 + 大纲 只读 |
| 质量把控 | `preset-reader-feedback` | 读者视角 | 章节 只读 |

### 工具定义（`mastra/src/tools/novel-tools.ts`）

15 个工具：

| 工具名 | 功能 | 需要 projectId |
|---|---|---|
| `createProject` | 创建书籍 | ❌（自生成） |
| `createWorldSetting` | 创建世界设定 | ✅ |
| `updateWorldSetting` | 更新世界设定 | ❌（按 ID） |
| `listWorldSettings` | 列出世界设定 | ✅ |
| `createWorldSettingType` | 创建世界设定分类 | ✅ |
| `createChapter` | 创建章节 | ✅ |
| `updateChapter` | 更新章节 | ❌（按 ID） |
| `listChapters` | 列出章节 | ✅ |
| `createOutline` | 创建大纲节点 | ✅ |
| `updateOutline` | 更新大纲节点 | ❌（按 ID） |
| `listOutlines` | 列出大纲节点 | ✅ |
| `updateChaptersBySetting` | 根据设定变更筛出/同步章节 | ✅ |

### 工具上下文限制

工具通过 `AGENT_TOOL_MAP` 按 agent 静态分配，每个 preset agent 只能访问其授权的工具子集。需要 `projectId` 的工具（如 `createWorldSetting`、`listChapters` 等）通过 `RequestContext` 从请求 body 的 `data.bookId` / `data.projectId` 获取 context，若 context 缺失则工具返回错误提示。

`createProject` 是唯一不需要 `projectId` 的工具，可在无项目上下文时调用。

### 建书后的 AI 自动初始化

- `projects` 表新增 `world_init_status` 与 `world_init_error`
- `POST /api/projects` 与 AI 工具 `createProject` 都会先创建项目，再异步触发 `initializeProjectWorld(projectId)`
- `initializeProjectWorld()` 位于 `mastra/src/lib/project-world-init.ts`，内部直接通过 `getMastra().getAgentById('preset-director').generate(...)` 调用 Director
- 初始化使用独立 memory 线程：`resource = project-{projectId}`，`thread = project-init-{projectId}-{uuid}`
- 初始化完成后项目状态更新为 `ready`；失败则置为 `failed` 并写入 `worldInitError`
- 若 AI 没有创建“角色”分类，后端会补建 `wst-characters--{projectId}`，以保证角色相关工作流仍有稳定锚点

### 页面联动推荐

| 页面 | `recommendedAgentHint` | 推荐结果 |
|---|---|---|
| `/new-book` | `导演` | preset-director（锁定） |
| `/books/:id/world` | `worldbuilding` | 世界观构建 |
| `/books/:id/outline` | `outline` | 大纲规划 |
| `/books/:id/review` | `review` | 审阅 |

---

## 后端路由结构

```
mastra/src/
├── server.ts        # Hono 实例 + MastraServer.registerContextMiddleware() + 路由注册
├── mastra.ts        # Mastra 实例 + Memory 初始化 + 10 个 preset agent 构建 + 动态 agent 构建
├── routes/
│   ├── chat.ts      # POST /api/chat/:agentId（preset 走 handleChatStream，动态走 agent.stream + toAISdkStream）
│   ├── system.ts    # GET /api/shell, /api/mastra, /api/bootstrap
│   ├── agents-config.ts # /api/agents-config CRUD + GET /api/agents（返回 ID 列表）
│   ├── conversations.ts # /api/conversations CRUD（基于 Mastra Memory API，支持 projectId 过滤/绑定）
│   ├── projects.ts  # CRUD /api/projects（含归档/恢复 + /projects/:id/world/initialize）
│   ├── chapters.ts  # CRUD /api/projects/:id/chapters, /api/chapters/:id
│   ├── world.ts     # CRUD /api/projects/:id/world/types, /api/projects/:id/world/settings
│   ├── outlines.ts  # CRUD /api/projects/:id/outlines, /api/outlines/:id
│   ├── settings.ts  # /api/settings KV store
│   └── providers.ts # /api/providers CRUD + /api/providers/:id/models
├── tools/
│   └── novel-tools.ts  # AI 工具定义（15 个）+ getToolsForAgent() 按 agent 返回工具子集
│                       # + AGENT_TOOL_MAP 定义每个 agent 的工具权限
├── lib/
│   ├── resolve-provider.ts # LLM Provider 解析工具（从 DB 查找 baseUrl/apiKey）
│   └── project-world-init.ts # 建书后 Director 自动生成 world 分类与初始设定
└── db/
    ├── schema.ts    # Drizzle schema（含 projects / chapters / world settings / outlines / providers 等）
    └── db.ts        # 零配置 DB 初始化 + DDL bootstrap + 预置 agent seed（10 个）
```

---

## Mastra 集成决策

### 为什么保持独立 Hono 服务器

Mastra 的 `MastraServer` 会自动注册所有内置路由（Agent API、Memory API 等），这些路由路径会与我们的自定义领域路由冲突。因此保持独立 Hono 服务器，使用 Mastra 的 framework-agnostic API 集成。

### 三种集成方式

| 方式 | 适用场景 | 本项目 |
|------|---------|--------|
| `chatRoute({ path: '/chat/:agentId' })` | 使用 Mastra 内置服务器 | ❌ 与自定义领域路由冲突 |
| `handleChatStream({ mastra, agentId, params })` | Framework-agnostic，Mastra 注册的 agent | ✅ Preset agent 采用 |
| `agent.stream()` + `toAISdkStream()` + `createUIMessageStreamResponse()` | 完全自定义控制，支持任意 agent | ✅ 动态 agent 回退方案 |

**实际方案**：双路径架构。Preset agent（10 个已注册）走 `handleChatStream()`（Mastra 推荐的 framework-agnostic 模式），用户动态创建的 agent 走手动 `agent.stream()` + `toAISdkStream()` 回退路径。详见 [AI SDK 接入](#ai-sdk-接入) 部分的数据流说明。

---

## Tauri Sidecar 机制

### 开发模式

`#[cfg(not(debug_assertions))]` 保护——debug 构建不启动 sidecar，Mastra 由 `dev-services.mjs` 单独管理（支持热重载）。

### 生产模式

Tauri 在 `setup()` 中通过 `tauri-plugin-shell` 的 `ShellExt::sidecar()` 启动 `mastra-server` 二进制，监听 stdout/stderr 写入 bootstrap 日志，进程随 app 退出自动终止。

### 打包 sidecar 二进制

```bash
pnpm build:sidecar
```

依赖：`esbuild`（ESM → CJS bundle）+ `@yao-pkg/pkg`（Node.js → 原生二进制）。

输出命名：`mastra-server-<rust-target-triple>[.exe]`，符合 Tauri `externalBin` 要求。

`@libsql/client` 的 native `.node` 文件由 pkg 运行时解压到临时目录，无需额外配置。
