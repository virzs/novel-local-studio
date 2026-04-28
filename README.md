# Novel Local Studio

> AI 优先、本地优先的长篇小说写作桌面软件 — 双击安装，零命令行配置。

Novel Local Studio 是一款受 "Claude Desktop / opencode" 体验启发的桌面写作工具：**左侧文件树 / 中间只读内容 / 右侧多智能体 AI 聊天**。所有创作、修改、扩写全部通过 AI 对话完成 — 人类只需阅读、审稿、决策。

## 核心特性

- **AI 优先 (AI-First)** — 所有内容只读展示；任何修改由 AI 工具调用完成。你是导演兼审稿人。
- **多智能体协作** — 一个 Supervisor 总编辑 + 4 个专业 sub-agent（架构师 / 执笔者 / 润色师 / 设定守护者）协同工作。
- **本地优先 (Local-First)** — 数据全部存储在本地磁盘，无云依赖。仅在调用 LLM 时联网。
- **零配置安装** — 双击 `.dmg` / `.msi` / `.AppImage` 即可使用，内置 Node.js sidecar，无需自行安装 Node.js、Python 或 Docker。
- **长篇友好** — 支持 50 万字以上长篇小说，全文检索（FTS5 + 中文分词）与语义向量检索兼备。
- **灵活的 LLM 配置** — 自由配置 Provider（OpenAI、Anthropic、DeepSeek、Ollama 或任意 OpenAI 兼容端点），每个 Agent 可独立使用不同模型。

### AI 智能体

| Agent | 中文名 | 职责 |
|---|---|---|
| **Supervisor** | 总编辑 | 任务理解、路由分派、综合结果回复用户 |
| **Architect** | 架构师 | 世界观、设定、大纲、人物档、剧情结构规划 |
| **Chronicler** | 执笔者 | 基于大纲与设定撰写正文（章节、场景、对白） |
| **Editor** | 润色师 | 改写、节奏调整、对白润色、风格优化（不改剧情） |
| **LoreKeeper** | 设定守护者 | 一致性校验：人名、时间线、地点、规则核查 |

## 技术栈

| 分层 | 技术 | 用途 |
|---|---|---|
| 桌面壳 | **Tauri 2.x** | 体积小、Rust 安全沙箱、原生 sidecar 支持 |
| 前端 | **React 18 + TypeScript** | UI 框架 |
| 样式 | **TailwindCSS 4** | 原子化 CSS |
| AI 聊天 UI | **@assistant-ui/react** | 无障碍聊天原语，原生支持 tool-call 嵌套渲染 |
| AI SDK | **Vercel AI SDK v5** | 流式聊天状态管理 |
| Markdown | **streamdown** | 流式 AI 输出优化的 Markdown 渲染器 |
| 文件树 | **react-arborist** | 虚拟化、键盘可导航的树组件 |
| 分栏 | **react-resizable-panels** | IDE 风格可拖拽分栏 |
| 状态管理 | **Zustand** | 轻量级状态管理 |
| 后端框架 | **Mastra** | AI Agent 框架，原生支持 Agent 编排 |
| 后端运行时 | **Node.js 22 (sidecar)** | 由 Tauri 管理的 sidecar 进程 |
| 业务数据库 | **LibSQL** | 单文件 SQLite 兼容数据库 |
| 向量存储 | **LibSQLVector** | 向量嵌入（共用同一数据库文件） |
| 全文检索 | **better-sqlite3 + FTS5** | 支持中文分词的全文检索 |
| 嵌入模型 | OpenAI `text-embedding-3-small` | 1536 维向量嵌入（MVP 阶段） |

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│ Tauri App（Rust 主进程）                                          │
│                                                                    │
│  ┌──────────────────────┐    ┌─────────────────────────────────┐ │
│  │ WebView（前端）      │    │ Sidecar 子进程（Node 22）       │ │
│  │                      │    │                                 │ │
│  │ React + Tailwind     │    │ Mastra Server (Hono)            │ │
│  │ assistant-ui         │◄──►│  ├─ Supervisor Agent            │ │
│  │ Vercel AI SDK        │HTTP│  ├─ 4 个 Sub-Agent              │ │
│  │                      │    │  ├─ Tools（CRUD + 检索）        │ │
│  └──────────────────────┘    │  ├─ Memory（LibSQL）            │ │
│                               │  ├─ Vector（LibSQLVector）     │ │
│                               │  └─ FTS（better-sqlite3）      │ │
│                               └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- **Tauri 主进程**负责启动 Node.js sidecar、探测空闲端口、将服务端 URL 暴露给前端。
- **Mastra** 提供 Supervisor + sub-agent 编排、记忆管理和向量存储能力。
- **所有数据**存储在用户应用数据目录下的单一 `app.db` SQLite 文件中。
- **前端只读** — 所有修改均通过 AI 聊天端点走工具调用完成。

## 开发指南

### 环境要求

- **Node.js** >= 22
- **pnpm** >= 10
- **Rust**（用于 Tauri 原生编译）

### 安装与启动

```bash
# 安装依赖
pnpm install

# 启动开发（Tauri 桌面应用）
pnpm dev

# 启动纯 Web 开发（浏览器）
pnpm dev:web

# 单独启动 Mastra 后端
pnpm dev:mastra

# 类型检查所有包
pnpm typecheck
```

### 构建

```bash
# 构建 Mastra 后端
pnpm build:mastra

# 构建桌面安装包（macOS .dmg / Windows .msi / Linux .AppImage）
pnpm build
```

## 项目结构

```
novel-local-studio/
├── app/                   # Tauri + React 前端
│   ├── src/
│   │   ├── library/       # 书籍文件树、文档阅读器、线程列表
│   │   ├── chat/          # AI 聊天面板
│   │   ├── settings/      # Provider 配置、Agent 设置、模型绑定
│   │   ├── splash/        # 启动屏
│   │   └── components/ui/ # shadcn/ui 组件
│   └── src-tauri/         # Rust 后端（sidecar 管理）
├── mastra/                # Node.js 后端
│   └── src/
│       ├── agents/        # Supervisor + 4 个 sub-agent
│       ├── tools/         # AI 工具（CRUD + 检索）
│       ├── db/            # LibSQL、FTS5、向量存储
│       ├── llm/           # Provider 注册表与模型绑定
│       ├── rag/           # 分块、嵌入、索引
│       └── server.ts      # Hono HTTP 服务入口
├── scripts/               # 构建脚本（下载 Node、打包 Mastra、准备资源）
├── docs/                  # 文档
│   └── design.md          # 完整设计文档（v3）
└── package.json           # 工作区根配置
```

## 文档

- **[design.md](./docs/design.md)** — 完整架构设计文档，涵盖产品定位、技术栈决策、多智能体设计、数据模型及实施路线图。

## 许可

私有项目。保留所有权利。
