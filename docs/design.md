# Novel Local Studio — 设计文档 v3

> AI 优先的本地长篇小说写作软件。一键安装、零命令行配置、本地优先、多智能体协作。
>
> 本文档不参考 `.old/` 的任何技术实现，旧版完全废弃，全新重做。

**版本历史**
- v1：基础架构与 MVP 范围
- v2：多智能体（Supervisor + 4 sub-agents）、FTS5 客户端方案修正（LibSQL + better-sqlite3 混合）、向量检索纳入 MVP、明确"全只读 + AI 驱动修改"
- v3：新增 **Provider 配置层**（文本生成 & 嵌入模型 provider 用户可自由配置 + 每个 Agent 可独立覆盖）；落实 Phase 0 用 trigram tokenizer 起步、新建书籍用"基础表单 + AI 引导可选"

---

## 1. 产品定位

### 1.1 一句话定义
"Claude Desktop / opencode 风格"的桌面写作软件——左侧文件树 / 中间纯文本内容 / 右侧多智能体 AI 聊天面板。所有创作、修改、扩写都通过 AI 对话完成，人类只读、审稿、决策。

### 1.2 核心理念
- **AI 优先 (AI-first)**：所有内容**全只读**展示，任何修改都由 AI 工具调用完成；人类是导演 + 审稿。
- **多智能体协作**：一个 Supervisor 智能体把关，按任务派发给专业 sub-agent（架构师 / 写手 / 编辑 / 设定守护者）。
- **本地优先 (Local-first)**：数据存于用户磁盘，无云依赖；只在调用 LLM 时连网。
- **零配置安装**：双击安装包即可使用，无需 Node.js / Python / Docker / 命令行。
- **长篇友好**：单本 50 万字以上，全文检索 + 语义检索都需快速。

### 1.3 目标用户
中文网络小说作者、长篇创作者、需要 AI 辅助但保留作者把控权的创作者。

---

## 2. 功能范围

### 2.1 MVP 版本

| 模块 | 功能 |
|---|---|
| 书籍管理 | 通过 AI 对话或基础表单创建书；列表、归档、删除 |
| 文件树 | `书 → 设定/大纲/卷/章` 树形展示，虚拟滚动 |
| 纯文本展示 | 章节/设定/大纲只读 Markdown 渲染（**禁止前端编辑**） |
| AI 聊天 | 常驻右侧，与当前书绑定上下文，流式输出，工具调用与子 agent 调用全可视化 |
| **多智能体** | Supervisor + 4 sub-agents，按需派发 |
| AI 工具集 | 全套 CRUD 工具（章节/设定/大纲）+ 检索工具 |
| **混合检索** | FTS5（中文分词）+ 向量检索（语义），合并去重后 rerank |
| LLM 配置 | 设置页 → Provider 管理（OpenAI / Anthropic / DeepSeek / Ollama / 自定义 OpenAI 兼容端点）→ 为每个 Agent 与嵌入任务分别选定 provider+model |
| 嵌入模型配置 | 同上，独立的"嵌入 Provider"槽位；OpenAI provider 默认 `text-embedding-3-small` |
| 一键安装 | macOS `.dmg` / Windows `.msi` / Linux `.AppImage`，内置 Node.js 22 sidecar |

### 2.2 V1 后续

- 长程记忆增强（working memory + semantic recall 双轨）
- 章节版本历史与差异对比
- BGE-M3 + Cohere rerank（中文质量提升）
- 导出 txt/epub/docx
- 写作统计、字数追踪、心流模式
- 角色声音配置（character voice profile）
- 读者视角 / 反派视角的"重读"功能

### 2.3 非目标（明确排除）

- ❌ 任何形式的前端富文本编辑器（与 AI-first 理念冲突）
- ❌ 多人协作 / 云同步
- ❌ 内置 LLM 推理
- ❌ 移动端
- ❌ 旧版 `.old/` 数据迁移（已确认放弃）

---

## 3. 技术栈决策

| 层 | 选择 | 理由 |
|---|---|---|
| 桌面壳 | **Tauri 2.x** | 体积小、Rust 安全沙箱、官方 sidecar |
| 前端 | **React 18 + TypeScript** | 生态最广，AI UI 库一等支持 |
| 样式 | **TailwindCSS 4** | 用户约束 |
| 图标 | **@remixicon/react** | 用户约束 |
| AI 聊天 UI | **@assistant-ui/react + @assistant-ui/react-ai-sdk** | 无样式可访问的聊天原语，原生支持 tool-call 嵌套渲染（含 sub-agent 调用） |
| AI SDK | **Vercel AI SDK v5** (`ai` / `@ai-sdk/react`) | `useChat` 流式状态；与 Mastra 通过 `@mastra/ai-sdk` 桥接 |
| Markdown | **streamdown** | Vercel 出品，专为流式 AI 输出，自动处理不完整 Markdown |
| 文件树 | **react-arborist** | 虚拟化、大数据集、键盘导航 |
| 分栏 | **react-resizable-panels** | IDE 风格分栏事实标准 |
| 状态 | **Zustand** | 轻量 |
| 路由 | **React Router 7** | 标准 |
| **后端框架** | **Mastra** | 用户指定 |
| 后端运行时 | **Node.js 22 (sidecar)** | 兼容 Mastra 与 native 模块 |
| **元数据 / 业务数据** | **LibSQL** (`@libsql/client` + `@mastra/libsql`) | Mastra storage 一等支持，单文件 |
| **向量存储** | **LibSQLVector** (`@mastra/libsql`) | Mastra vector 一等支持，与 storage 同库 |
| **全文检索** | **better-sqlite3 + FTS5 + simple-jieba 扩展** | LibSQL 客户端不支持 `loadExtension`，需混合方案；同一 db 文件，better-sqlite3 单独连接 |
| 嵌入模型 | OpenAI `text-embedding-3-small` (1536 维, MVP) → BGE-M3 (V1) | MVP 用 OpenAI 兼容协议最省事；V1 评估中文质量 |
| Reranker | （V1 引入 Cohere `rerank-multilingual-v3.0`） | MVP 先纯 hybrid + RRF |
| 中文分词 | **simple-jieba** (FTS5 自定义 tokenizer) | 优于内置 trigram；fallback 到 trigram 零依赖 |
| LLM Provider | Vercel AI SDK provider 抽象 + Provider 配置层（见 §4） | OpenAI / Anthropic / DeepSeek / Ollama / 自定义 OpenAI 兼容端点；每个 Agent 与嵌入任务可独立指定 |
| 打包 | **Tauri sidecar + 内置 Node 二进制** | 用户零配置，最稳 |

### 3.1 关键决策修正（v1 → v2）

#### ⚠️ FTS5 客户端方案修正
**v1 设想**：LibSQL 一把梭，FTS5 + jieba 全跑在 LibSQL。
**v2 修正**：调研发现 `@libsql/client` Node 版**不暴露 `loadExtension()`** API → 无法注册 jieba tokenizer。
**v2 方案**：**双客户端 + 同一 db 文件**：
- `@libsql/client` + `@mastra/libsql`：负责 Mastra storage、memory、向量
- `better-sqlite3`：负责 FTS5 虚拟表与 jieba tokenizer 注册（仅 fts 相关读写）
- 两个 client 连同一个 `app.db`，Node.js 单进程下 SQLite 文件锁机制保证安全
- **fallback**：若 jieba 编译/分发困难，可临时用内置 `trigram` tokenizer（零依赖、CJK 可用、索引大但能跑）

#### ⚠️ 多智能体模式确定
**v1 设想**：MVP 单 Agent，多 Agent 留 V1。
**v2 修正**：用户明确要求 MVP 即多智能体。Mastra 官方提供 **Supervisor Agent 模式**（`Agent` 类的 `agents` 属性），sub-agent 自动包装为工具，原生支持流式 + 嵌套 tool-call + memory 隔离。

#### ✅ 向量检索 MVP 包含
用户已确认。LibSQLVector 原生支持，无额外组件。

---

## 4. 架构

### 4.1 进程拓扑

```
┌──────────────────────────────────────────────────────────────┐
│ Tauri App (Rust 主进程)                                       │
│                                                                │
│  ┌─────────────────────┐    ┌──────────────────────────────┐  │
│  │ WebView (前端)      │    │ Sidecar 子进程 (Node 22)      │  │
│  │                     │    │                              │  │
│  │ React + Tailwind    │    │ Mastra Server (Hono)         │  │
│  │ assistant-ui        │◄──►│  ├─ Supervisor Agent         │  │
│  │ Vercel AI SDK       │HTTP│  ├─ Architect / Chronicler / │  │
│  │ (useChatRuntime)    │ ws │  │  Editor / Lore Keeper     │  │
│  │                     │    │  ├─ Tools (CRUD + Search)    │  │
│  └─────────────────────┘    │  ├─ Memory (LibSQL)          │  │
│                             │  ├─ Vector (LibSQLVector)    │  │
│                             │  └─ FTS (better-sqlite3)     │  │
│                             │                              │  │
│                             │ ./app.db (同一 SQLite 文件)   │  │
│                             └──────────────────────────────┘  │
│                                                                │
│  Tauri Rust 命令：                                             │
│   - 端口探测 → 启动 sidecar 并传 --port / --data-dir          │
│   - 监听 sidecar stdout 的 READY 信号                         │
│   - 暴露 serverUrl / dataDir 给前端                           │
│   - 文件导入导出（V1）                                         │
│   - 优雅关闭顺序                                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 启动时序

1. Tauri 主进程启动
2. Rust 探测空闲端口（`portpicker` crate）
3. Rust spawn `binaries/node mastra-server.js --port <P> --data-dir <D>`
4. sidecar:
   - 用 `@libsql/client` 打开 `<D>/app.db`，跑 Mastra storage 迁移
   - 用 `better-sqlite3` 打开同一文件，`loadExtension('libsimple_jieba.so')`，建 FTS5 虚拟表与触发器
   - 注册 Supervisor + 4 sub-agents
   - 启动 Hono server
   - stdout 输出 `READY:<port>`
5. Rust 读取 `READY` → 通过 Tauri command `getServerUrl()` 暴露给前端
6. 前端初始化时调用 `getServerUrl()`，所有 fetch / EventSource 连 `http://127.0.0.1:<P>`
7. 退出：Tauri 收到 close → SIGTERM → sidecar 关闭两个 db 连接 → 进程退出 → Tauri 退出

### 4.3 关键 gotchas
- **端口**：动态选，避免冲突
- **数据目录**：`dirs::data_dir()` → `~/Library/Application Support/NovelLocalStudio/`（macOS 例）
- **native 模块**：`better-sqlite3.node`、`libsimple_jieba.[so|dylib|dll]` 三平台分别构建，作为 Tauri `bundle.resources` 携带
- **关闭顺序**：必须等 sidecar 退出（fsync）再让 Tauri 主进程退出
- **db 双客户端并发**：两个 client 同进程同文件，Node 单线程 + SQLite 文件锁安全；只对 FTS 写入时短暂加锁

### 4.4 Provider 配置层 ⭐（v3 新增）

#### 设计目标
- 用户在设置页**自由配置任意数量的 Provider**（OpenAI / Anthropic / DeepSeek / Ollama / 自定义 OpenAI 兼容端点 / 自定义 Anthropic 兼容端点）
- 每个 Agent（supervisor / architect / chronicler / editor / loreKeeper）**独立绑定** provider+model
- 嵌入任务（业务向量化、Memory semantic recall）也独立绑定 provider+model
- 默认值合理：用户只配一个 OpenAI Provider 即可全部跑起来
- 配置热更新：保存后下一次对话生效，无需重启 sidecar

#### 数据模型

```sql
-- 存于 app_kv 表（JSON value），key = 'providers' 与 'modelBindings'
-- providers: 用户配置的 Provider 列表
[
  {
    "id": "openai-default",
    "kind": "openai",                  -- openai | anthropic | openai-compatible | ollama
    "label": "OpenAI 官方",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-...",                -- V1 接 OS keychain；MVP 明文存本地
    "headers": {}                      -- 自定义请求头（可选）
  },
  {
    "id": "deepseek",
    "kind": "openai-compatible",
    "label": "DeepSeek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-..."
  },
  {
    "id": "ollama-local",
    "kind": "ollama",
    "label": "本地 Ollama",
    "baseUrl": "http://127.0.0.1:11434"
  }
]

-- modelBindings: 每个用途的 provider+model 绑定
{
  "agents": {
    "supervisor":  { "providerId": "openai-default", "model": "gpt-4o" },
    "architect":   { "providerId": "openai-default", "model": "gpt-4o-mini" },
    "chronicler":  { "providerId": "openai-default", "model": "gpt-4o" },
    "editor":      { "providerId": "openai-default", "model": "gpt-4o-mini" },
    "loreKeeper":  { "providerId": "openai-default", "model": "gpt-4o-mini" }
  },
  "embedding": {
    "providerId": "openai-default",
    "model": "text-embedding-3-small",
    "dimension": 1536              -- 切换模型需提示用户重建索引
  }
}
```

#### Provider Registry（运行时）

```typescript
// mastra/src/llm/providers.ts
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOllama } from 'ollama-ai-provider';
import type { LanguageModel, EmbeddingModel } from 'ai';

class ProviderRegistry {
  private cache = new Map<string, ReturnType<typeof createOpenAI>>();

  reload(providers: ProviderConfig[]) {
    this.cache.clear();
    for (const p of providers) {
      switch (p.kind) {
        case 'openai':
        case 'openai-compatible':
          this.cache.set(p.id, createOpenAI({ baseURL: p.baseUrl, apiKey: p.apiKey, headers: p.headers }));
          break;
        case 'anthropic':
          this.cache.set(p.id, createAnthropic({ baseURL: p.baseUrl, apiKey: p.apiKey }));
          break;
        case 'ollama':
          this.cache.set(p.id, createOllama({ baseURL: p.baseUrl }));
          break;
      }
    }
  }

  getLanguageModel(binding: { providerId: string; model: string }): LanguageModel {
    const provider = this.cache.get(binding.providerId);
    if (!provider) throw new Error(`Provider ${binding.providerId} not configured`);
    return provider(binding.model);
  }

  getEmbeddingModel(binding: { providerId: string; model: string }): EmbeddingModel<string> {
    const provider = this.cache.get(binding.providerId);
    if (!provider) throw new Error(`Provider ${binding.providerId} not configured`);
    return provider.embedding(binding.model);
  }
}

export const registry = new ProviderRegistry();
```

#### Agent 集成（动态 model 解析）

Mastra 的 `Agent` 支持 `model` 为函数 → 每次调用时动态解析当前绑定。

```typescript
// mastra/src/agents/architect.ts
import { Agent } from '@mastra/core/agent';
import { registry } from '../llm/providers';
import { loadBindings } from '../llm/bindings';

export const architect = new Agent({
  id: 'architect',
  model: async () => {
    const bindings = await loadBindings();
    return registry.getLanguageModel(bindings.agents.architect);
  },
  // ...
});
```

#### 嵌入模型集成

```typescript
// mastra/src/rag/embedder.ts
export async function embedTexts(texts: string[]) {
  const bindings = await loadBindings();
  const model = registry.getEmbeddingModel(bindings.embedding);
  return embedMany({ model, values: texts });
}
```

#### 切换嵌入维度的处理

| 场景 | 处理 |
|---|---|
| 用户首次配置 | 直接用，按维度建 `novel_content` 索引 |
| 用户切换到不同维度模型 | 设置页弹确认框："切换会失效现有 X 条向量索引，确认后将后台重建。" → 后台异步全量重新嵌入 |
| 用户切到同维度不同模型 | 警告"语义空间不一致，建议重建" → 用户可选立即重建 / 之后重建 |

#### 设置页 UX

```
┌─ 设置 ─────────────────────────────────────────┐
│ Providers                            [+ 新增]   │
│  ▸ OpenAI 官方       openai          ✏️ 🗑     │
│  ▸ DeepSeek          openai-compatible ✏️ 🗑   │
│  ▸ 本地 Ollama       ollama           ✏️ 🗑    │
│                                                │
│ 模型绑定                                        │
│  Supervisor (总编辑)   [OpenAI ▾] [gpt-4o ▾]  │
│  Architect (架构师)    [OpenAI ▾] [gpt-4o-mini]│
│  Chronicler (执笔者)   [OpenAI ▾] [gpt-4o ▾]  │
│  Editor (润色师)       [DeepSeek▾] [deepseek-chat]│
│  LoreKeeper (设定守护) [OpenAI ▾] [gpt-4o-mini]│
│  ─────────────────────                          │
│  Embedding (嵌入)      [OpenAI ▾] [text-embedding-3-small]│
│                                                │
│  [测试连接]  [保存]                              │
└────────────────────────────────────────────────┘
```

- model 下拉支持自由输入（兼容自定义模型名）
- "测试连接" 按钮：对每个 binding 调用一次最小请求验证

---

## 5. 多智能体设计 ⭐

### 5.1 角色总览

| 角色 | 中文名 | 职责 | 拥有工具 | Supervisor 何时调用 |
|---|---|---|---|---|
| **Supervisor** | 总编辑 | 任务理解、路由分派、综合结果回复用户 | 全部 sub-agents（自动转工具） + `searchContent`（自己也能查） | 所有用户消息入口 |
| **Architect** | 架构师 | 世界观、设定、大纲、人物档、卷章规划 | `upsertSetting`, `upsertOutlineNode`, `getOutline`, `searchContent` | 新书启动、新角色/世界、大改剧情、大纲调整 |
| **Chronicler** | 执笔者 | 写正文（章节、场景、对白）。基于大纲与设定生成长 prose | `getChapter`, `createChapter`, `updateChapter`, `appendToChapter`, `searchContent`（只读 setting） | 写新章、扩写、续写、补场景 |
| **Editor** | 润色师 | 改写、节奏、对白、风格、错别字。**不改剧情** | `getChapter`, `updateChapter`, `searchContent` | 用户要求"润色 / 改文风 / 节奏更紧 / 对话更精炼" |
| **LoreKeeper** | 设定守护者 | 一致性校验：人名、时间线、地点、规则。只读 + 报告差异 | `searchContent`, `getSetting`, `listSettings`, `getOutline` | Chronicler/Editor 完成后由 Supervisor 调用做 QA；用户直接问"X 是谁/何时" |

### 5.2 Supervisor 路由策略：**确定性 workflow + LLM 兜底**

- **确定性流水线**（Supervisor 内部硬编码识别意图后走流程）：
  - "写第 N 章" → Architect 取大纲 → Chronicler 写 → LoreKeeper 校验 → 不通过则交 Editor 修
  - "新建角色 X" → Architect 创建 → LoreKeeper 入库
- **LLM 路由**（无法匹配模板时）：依赖每个 sub-agent 的 `description`，由 Supervisor LLM 自行决定调用哪个

> Mastra 的 Supervisor 模式天然支持：把 sub-agent 放进 `agents:{}` 后会自动暴露为工具（如 `agent-architect`），Supervisor 用 ReAct 循环决定调用顺序。

### 5.3 Memory 隔离

- **Supervisor**：拥有完整对话 thread（用户可见）
- **Sub-agent**：每次被调用，由 `delegation.messageFilter` 过滤后只看到必要上下文：
  - Chronicler / Editor：最近 10 条消息 + 当前章节正文
  - Architect：最近 10 条 + 当前书的大纲摘要
  - LoreKeeper：仅当前任务输入（无历史，纯 RAG）

### 5.4 流式与可视化

- 用户在右侧聊天看到：
  ```
  user: 写第三章，主角进入雪原
  supervisor: 正在调度...
    🔧 architect.getOutline ✓ (返回第三章大纲)
    🔧 agent-chronicler 启动
        🔧 chronicler.searchContent("林白 性格") ✓
        🔧 chronicler.createChapter ✓
    🔧 agent-loreKeeper 启动
        ✓ 一致性通过
  supervisor: 已完成第三章初稿（2843字），可在文件树中查看。
  ```
- assistant-ui 的 `Message.ToolInvocations` 默认渲染 tool-call（含嵌套）；自定义 renderer 给 `agent-*` 工具特别样式（折叠卡片、显示 sub-agent 内部步骤）

### 5.5 代码骨架

> Agent 的 `model` 字段使用动态函数形式，从 Provider Registry（§4.4）按当前绑定解析，**不在代码里硬编码模型名**。

```typescript
// mastra/src/agents/index.ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { architectTools, chroniclerTools, editorTools, loreKeeperTools, sharedSearch } from '../tools';
import { registry } from '../llm/providers';
import { loadBindings } from '../llm/bindings';

const memory = new Memory({
  storage: new LibSQLStore({ url: `file:${DATA_DIR}/app.db` }),
  vector:  new LibSQLVector({ connectionUrl: `file:${DATA_DIR}/app.db` }),
  options: { workingMemory: { enabled: true }, semanticRecall: { topK: 5 } },
});

const modelFor = (agentKey: keyof Bindings['agents']) => async () => {
  const b = await loadBindings();
  return registry.getLanguageModel(b.agents[agentKey]);
};

export const architect = new Agent({
  id: 'architect',
  description: '架构师：负责世界观、设定、大纲、人物档、卷章规划。需要新建/修改角色、地点、势力、剧情骨架时调用我。',
  instructions: '...',
  model: modelFor('architect'),
  tools: { ...architectTools, searchContent: sharedSearch },
});

export const chronicler = new Agent({
  id: 'chronicler',
  description: '执笔者：基于大纲与设定写正文。需要写新章节、扩写场景、续写时调用我。',
  instructions: '...',
  model: modelFor('chronicler'),
  tools: { ...chroniclerTools, searchContent: sharedSearch },
});

export const editor = new Agent({
  id: 'editor',
  description: '润色师：改写、节奏、对白、风格调整。不改剧情。',
  instructions: '...',
  model: modelFor('editor'),
  tools: { ...editorTools, searchContent: sharedSearch },
});

export const loreKeeper = new Agent({
  id: 'loreKeeper',
  description: '设定守护者：一致性校验。回答"X 是谁/何时/何地"，校验新章节是否符合既定设定。',
  instructions: '...',
  model: modelFor('loreKeeper'),
  tools: { ...loreKeeperTools, searchContent: sharedSearch },
});

export const supervisor = new Agent({
  id: 'supervisor',
  name: '总编辑',
  instructions: `你是小说项目的总编辑。根据用户请求，决定调用哪个专家：
    - architect: 设定/大纲/角色/世界观
    - chronicler: 写正文
    - editor: 润色已有文本
    - loreKeeper: 一致性校验、查询设定
    标准流程：写新章 → architect 取大纲 → chronicler 写 → loreKeeper 校验。
    所有产出整合后用中文简洁告知用户结果。`,
  model: modelFor('supervisor'),
  agents: { architect, chronicler, editor, loreKeeper },
  memory,
  defaultOptions: {
    maxSteps: 15,
    delegation: {
      messageFilter: ({ messages, primitiveId }) => {
        const recent = messages.filter(m => m.role !== 'system').slice(-10);
        return recent;
      },
    },
  },
});
```

---

## 6. 数据模型

### 6.1 实体关系

```
Book
 ├── Volume (卷)
 │    └── Chapter (章节，正文)
 ├── SettingCategory (角色/世界观/地点/势力 ...)
 │    └── SettingEntry
 ├── OutlineNode (大纲，自引用树)
 ├── Conversation (与 AI 的会话)
 │    └── Message
 └── Embedding (跨实体向量索引，多对一)
```

### 6.2 SQL Schema

```sql
-- ===== 业务表（@libsql/client 写入） =====

CREATE TABLE book (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  synopsis TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE volume (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER NOT NULL
);

CREATE TABLE chapter (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  volume_id TEXT REFERENCES volume(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE setting_category (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  order_index INTEGER NOT NULL
);

CREATE TABLE setting_entry (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES setting_category(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT,                              -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE outline_node (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES outline_node(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                     -- volume | chapter | beat
  title TEXT NOT NULL,
  summary TEXT,
  order_index INTEGER NOT NULL,
  linked_chapter_id TEXT REFERENCES chapter(id)
);

CREATE TABLE conversation (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE,
  title TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                     -- user | assistant | tool
  content TEXT NOT NULL,                  -- AI SDK message JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE app_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                    -- JSON
  updated_at INTEGER NOT NULL
);

-- ===== Mastra 自管表 =====
-- @mastra/libsql 在初始化时自动创建 mastra_messages / mastra_threads / mastra_resources / mastra_workflows 等

-- ===== 向量表（LibSQLVector 自管） =====
-- LibSQLVector.createIndex({ indexName: 'novel_content', dimension: 1536 })
-- 自动建表 + libsql_vector_idx 索引

-- ===== FTS5 表（better-sqlite3 创建并维护） =====

CREATE VIRTUAL TABLE chapter_fts USING fts5(
  chapter_id UNINDEXED,
  book_id UNINDEXED,
  title,
  content,
  tokenize = 'simple'                     -- simple-jieba 提供，含中文分词
);

CREATE VIRTUAL TABLE setting_fts USING fts5(
  entry_id UNINDEXED,
  book_id UNINDEXED,
  title,
  content,
  tokenize = 'simple'
);

-- 同步触发器（写入 chapter / setting_entry 时自动更新 FTS）
CREATE TRIGGER chapter_ai AFTER INSERT ON chapter BEGIN
  INSERT INTO chapter_fts(chapter_id, book_id, title, content)
  VALUES (new.id, new.book_id, new.title, new.content);
END;
CREATE TRIGGER chapter_au AFTER UPDATE OF title, content ON chapter BEGIN
  UPDATE chapter_fts SET title = new.title, content = new.content WHERE chapter_id = new.id;
END;
CREATE TRIGGER chapter_ad AFTER DELETE ON chapter BEGIN
  DELETE FROM chapter_fts WHERE chapter_id = old.id;
END;
-- setting_entry 同理
```

### 6.3 向量化策略

| 实体 | 切块 | 索引时机 |
|---|---|---|
| Chapter | 句子级，maxSize 300 字，overlap 25 字（Chinese-friendly）| createChapter / updateChapter 后异步入队 |
| SettingEntry | 整体一块（一般 < 1000 字）| upsertSetting 后立即 |
| OutlineNode | summary 字段整体一块 | upsertOutlineNode 后立即 |

- 嵌入模型：MVP `text-embedding-3-small` (1536 维)
- 向量元数据：`{ book_id, source_type, source_id, chunk_index, text }`
- 索引：`novel_content`（所有书共用，按 `book_id` 元数据过滤）

### 6.4 混合检索（Hybrid Retrieval）

> Mastra 无内置 HybridRetriever，需自行实现。

```typescript
// mastra/src/tools/search.ts
async function hybridSearch({ query, bookId, topK = 8 }) {
  // 1. FTS5（better-sqlite3）
  const fts = ftsDb.prepare(`
    SELECT chapter_id AS source_id, 'chapter' AS source_type,
           snippet(chapter_fts, 3, '<mark>', '</mark>', '...', 30) AS text,
           bm25(chapter_fts) AS score
    FROM chapter_fts
    WHERE book_id = ? AND chapter_fts MATCH ?
    ORDER BY score LIMIT ?
  `).all(bookId, query, topK);

  // 2. Vector（LibSQLVector）
  const { embedding } = await embed({ model, value: query });
  const sem = await vectorStore.query({
    indexName: 'novel_content',
    queryVector: embedding,
    topK,
    filter: { book_id: bookId },
  });

  // 3. RRF (Reciprocal Rank Fusion) 合并
  return rrfMerge(fts, sem, { k: 60 }).slice(0, topK);
}
```

V1 在 RRF 后接 Cohere `rerank-multilingual-v3.0` 进一步精排。

### 6.5 检索如何暴露给 agent

- 作为工具 `searchContent({ query, scope?, topK? })`，所有 sub-agent 都挂载
- agent 决定何时检索（不做自动注入，避免无谓上下文消耗）
- LoreKeeper 几乎每次任务都会调用

---

## 7. 前端布局

### 7.1 工作区主界面

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar: 书名▾ · 检索框 · 设置                                     │
├──────────┬──────────────────────────────┬────────────────────────┤
│          │                              │                        │
│  文件树  │      内容查看区               │   AI 聊天 (Supervisor) │
│ react-   │                              │                        │
│ arborist │   # 第三章 初遇              │  user: 写第三章         │
│          │                              │                        │
│ - 设定   │   林白推开门时，雪正下得最   │  supervisor: 调度中...  │
│   ├角色 │   急。冷风裹着碎雪扑进...    │  ▶ agent-architect ✓   │
│   └地图 │   （streamdown 渲染，只读）  │  ▶ agent-chronicler    │
│ - 大纲  │                              │     ├ search ✓         │
│ - 卷一  │   📊 字数: 2843 · 修改: 刚刚 │     └ createChapter ✓  │
│   ├C1   │                              │  ▶ agent-loreKeeper ✓  │
│   ├C2   │                              │                        │
│   ├C3◄ │                              │  已完成第三章 (2843字) │
│   └C4   │                              │                        │
│ - 卷二  │                              │  [Composer ↵]          │
└──────────┴──────────────────────────────┴────────────────────────┘
   240px              flex-1                    420px
```

- 三栏：`react-resizable-panels`，可拖拽，折叠按钮在 TopBar
- 文件树：`react-arborist`（虚拟滚动）
- 内容区：`streamdown` 只读 Markdown；顶部元信息条（字数 / 修改时间 / "AI 修改" 按钮 → 打开聊天 + 预填提示）
- 聊天：`@assistant-ui/react`，自定义 Tool renderer 渲染嵌套 sub-agent

### 7.2 其它页面

- **书架页**：网格布局；"新建书籍" 卡片 → 弹窗：基础表单（书名必填、类型可选）+ 底部 "🪄 让 AI 帮我构思" 按钮（点击进入 Supervisor 引导对话生成大纲与初始设定，对话产物自动落库）
- **设置页**：Provider 管理 + 模型绑定（详见 §4.4 UX）、数据导出、关于

### 7.3 自定义 Tool UI

```tsx
<Thread
  renderMessage={({ message }) => (
    <Message message={message}>
      <Message.Content />
      <Message.ToolInvocations renderTool={({ toolInvocation }) => {
        if (toolInvocation.toolName.startsWith('agent-')) {
          return <SubAgentCard invocation={toolInvocation} />;  // 折叠卡片，可展开看 sub-agent 内部步骤
        }
        if (toolInvocation.toolName === 'searchContent') {
          return <SearchResultsCard invocation={toolInvocation} />;
        }
        return <Tool.Default toolInvocation={toolInvocation} />;
      }} />
    </Message>
  )}
/>
```

---

## 8. 后端 (Mastra) 结构

```
mastra/
  src/
    server.ts                     # 入口，启动 Hono，监听 --port，输出 READY
    mastra.ts                     # Mastra 实例（agents + storage + vector + memory）
    db/
      libsql.ts                   # @libsql/client 实例 + 业务表迁移
      fts.ts                      # better-sqlite3 实例 + jieba 加载 + FTS 表/触发器
      repos/
        book.ts
        chapter.ts
        setting.ts
        outline.ts
    agents/
      supervisor.ts
      architect.ts
      chronicler.ts
      editor.ts
      loreKeeper.ts
      index.ts
    tools/
      book.ts                     # 书籍 CRUD
      chapter.ts                  # 章节 CRUD（写工具会触发向量化任务）
      setting.ts
      outline.ts
      search.ts                   # hybridSearch
      index.ts
    rag/
      embedder.ts                 # 嵌入模型抽象（OpenAI / 兼容 OpenAI 的 BGE-M3）
      chunker.ts                  # 句子级分块
      indexer.ts                  # createChapter 后的异步索引任务
    memory/
      index.ts                    # Mastra Memory 配置
    routes/
      books.ts                    # REST: /api/books, /api/books/:id/tree, ...
      search.ts                   # /api/search?q=&book=
      health.ts                   # /api/health
      chat.ts                     # @mastra/ai-sdk chatRoute → /api/chat/:agentId
    llm/
      providers.ts                # 从 app_kv 加载 Provider 配置
    util/
      port.ts
      paths.ts
```

### 8.1 Memory 配置

```typescript
new Memory({
  storage: new LibSQLStore({ url: `file:${DATA_DIR}/app.db` }),
  vector:  new LibSQLVector({ connectionUrl: `file:${DATA_DIR}/app.db` }),
  options: {
    workingMemory: { enabled: true, scope: 'thread' },
    semanticRecall: { topK: 5, messageRange: 3 },
  },
});
```

> Memory 的 `vector` 与业务向量共用同一个 LibSQLVector 客户端实例，但 indexName 不同（Memory 用 `mastra_memory_messages`，业务用 `novel_content`），互不干扰。

### 8.2 HTTP 端点

| 路由 | 用途 |
|---|---|
| `GET /api/health` | 启动探测 |
| `GET /api/books` / `POST /api/books` | 书 CRUD |
| `GET /api/books/:id/tree` | 一次返回文件树（卷/章/设定分类/设定条目/大纲） |
| `GET /api/chapters/:id` / `GET /api/settings/:id` / `GET /api/outline/:id` | 单条读取 |
| `GET /api/search?q=&book=` | 暴露给前端 TopBar 检索框 |
| `POST /api/chat/:agentId` | `@mastra/ai-sdk` chatRoute；前端固定调 `agentId=supervisor` |

> ⚠️ 前端**不直接**调用任何"修改"REST 路由。所有修改必须通过 `/api/chat/supervisor` 走 AI 工具调用（保证全 AI-driven 不变量）。

---

## 9. 打包与分发

### 9.1 构建产物
- macOS: `.dmg` (universal: x64 + arm64)
- Windows: `.msi` (x64)
- Linux: `.AppImage` (x64)

### 9.2 sidecar 构建链

```
scripts/
  fetch-node-binary.ts          # 下载 Node 22 LTS 三平台官方二进制 → app/src-tauri/binaries/
  build-jieba.ts                # 编译 simple-jieba 三平台 → app/src-tauri/resources/native/
  bundle-mastra.ts              # esbuild 把 mastra/ 打成单 mastra-server.js
                                # 收集 better-sqlite3 / @libsql 的 .node → resources/native/
```

### 9.3 `tauri.conf.json` 关键

```json
{
  "bundle": {
    "externalBin": ["binaries/node"],
    "resources": [
      "resources/mastra-server.js",
      "resources/native/**"
    ]
  }
}
```

### 9.4 首启行为
- `app.db` 不存在 → 跑迁移、建 FTS 表与触发器、创建空 Memory schema
- 检测无 LLM 配置 → 弹设置页 → 不填不给进
- （V1）首次启动跑 onboarding 教程

---

## 10. 仓库结构

```
novel-local-studio/
├── docs/
│   ├── design.md                # 本文
│   ├── architecture-diagrams/
│   └── adr/                     # Architecture Decision Records
├── app/                         # Tauri + React 前端
│   ├── src/
│   │   ├── components/          # 通用 UI（Button, Panel, ...）
│   │   ├── features/
│   │   │   ├── bookshelf/       # 书架页
│   │   │   ├── workspace/       # 三栏工作区
│   │   │   ├── book-tree/       # 文件树
│   │   │   ├── content-viewer/  # 只读 Markdown
│   │   │   ├── ai-chat/         # assistant-ui 集成
│   │   │   └── settings/
│   │   ├── routes/
│   │   ├── stores/              # zustand
│   │   ├── lib/
│   │   │   ├── api.ts           # REST 客户端
│   │   │   ├── tauri.ts         # Tauri invoke 包装
│   │   │   └── chat-runtime.ts  # useChatRuntime 配置
│   │   └── main.tsx
│   ├── src-tauri/
│   │   ├── src/main.rs          # sidecar 启动 + 端口管理 + 优雅关闭
│   │   ├── binaries/            # node 二进制（构建时下载）
│   │   ├── resources/           # mastra-server.js + native/
│   │   └── tauri.conf.json
│   └── package.json
├── mastra/                      # 后端
│   ├── src/                     # 见 §8 结构
│   └── package.json
├── scripts/
├── package.json                 # workspace root
└── pnpm-workspace.yaml
```

---

## 11. 实施路线图

### Phase 0 — 框架搭建 (3-4 天) ⭐ 优先

> 目标：把"骨架"全部立起来，每层都有最小可运行示例。

- [ ] pnpm workspace + Tauri 2 init + React + Tailwind 4 + Remixicon
- [ ] Mastra 项目初始化，Hono server 跑通
- [ ] sidecar 启动链：Rust spawn Node + 端口探测 + READY 信号 + 前端 health check 通过
- [ ] LibSQL 业务库 + 迁移
- [ ] better-sqlite3 + **FTS5 内置 trigram tokenizer** 跑通（PoC：插一条章节，FTS 能搜到中文词；simple-jieba 留到 Phase 2）
- [ ] LibSQLVector PoC：插一个向量，查询能返回
- [ ] **Provider Registry + 单 Provider (OpenAI) 配置最小闭环**（硬编码一份配置进 app_kv，后续 Phase 4 做 UI）
- [ ] **Supervisor + 1 个 sub-agent (architect)** 跑通（model 走 Registry 动态解析），能从前端聊天发消息看到 sub-agent 调用
- [ ] assistant-ui 接入，渲染流式 + tool-call

### Phase 1 — 数据 & CRUD 工具 (3-4 天)
- [ ] 全部 schema + 仓储层
- [ ] 全套 AI 工具（chapter / setting / outline / book CRUD）
- [ ] 文件树 API + 前端文件树渲染
- [ ] 内容查看器（streamdown）

### Phase 2 — 多智能体完整版 + 中文 FTS 升级 (4-5 天)
- [ ] 4 个 sub-agent 全部实装 + 每个的 instructions 调优
- [ ] Supervisor 路由策略（确定性流水线 + LLM 兜底）
- [ ] Memory 配置 + delegation.messageFilter
- [ ] Tool UI 自定义渲染（sub-agent 折叠卡片）
- [ ] 一致性校验流程（Chronicler → LoreKeeper）
- [ ] **simple-jieba 三平台编译 + 替换 trigram tokenizer**（FTS 索引重建脚本）

### Phase 3 — 检索 (2-3 天)
- [ ] 章节/设定/大纲的向量化管线（创建/更新后异步入队索引）
- [ ] FTS5 触发器
- [ ] hybridSearch 工具 + RRF 合并
- [ ] 前端 TopBar 检索框

### Phase 4 — 设置 & 一键安装 (3-4 天)
- [ ] **Provider 管理 UI**（增删改 OpenAI / Anthropic / DeepSeek / Ollama / 自定义兼容端点）
- [ ] **模型绑定 UI**（每个 Agent + 嵌入任务独立绑定 provider+model）
- [ ] "测试连接" 按钮 + 切换嵌入维度时的索引重建确认流程
- [ ] sidecar 打包脚本三平台
- [ ] 三平台安装包构建（GitHub Actions）
- [ ] 首启 onboarding（强制配置至少一个 Provider 才能进主界面）

### Phase 5 — 打磨
- [ ] 错误边界、崩溃恢复、日志
- [ ] 性能：大书加载、长聊天虚拟化
- [ ] README + 用户手册
- [ ] V1 升级：BGE-M3 + Cohere rerank、章节版本历史

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| simple-jieba 三平台编译复杂 | 高 | Phase 0 优先 PoC；不行就退回 FTS5 内置 trigram tokenizer（CJK 可用） |
| LibSQL Node client 的 `loadExtension` 永远不支持 | 中 | 已采用 better-sqlite3 双客户端方案，已规避 |
| Supervisor LLM 路由不稳 | 中 | 关键流程走确定性 workflow；LLM 仅兜底；好的 description 是关键 |
| sub-agent 调用导致 token 爆炸 | 中 | `messageFilter` 严格裁剪；sub-agent 用更小模型（gpt-4o-mini） |
| 长篇 (50万字) 时全文向量化耗时/费用 | 中 | 后台异步索引；首次导入显示进度；提供"暂缓索引"开关 |
| Mastra 仍在快速迭代，API 变动 | 低-中 | 锁定 minor 版本；CHANGELOG 跟踪；ADR 记录依赖假设 |
| LLM Key 泄漏 | 低 | 存于本地 `app_kv`；V1 接 OS keychain 加密 |
| 前端绕过 AI 直接调写 API | 中 | 后端 REST 路由不暴露任何修改端点，所有写入仅通过 chat 工具 |

---

## 13. 待确认（v3）

> v2 的 4 个待确认问题已全部由用户确认（详见 v3 版本说明）。当前无阻塞性待确认问题。

可在 Phase 0 推进过程中再就以下细节征求决策：
1. ⏳ Provider apiKey 在 MVP 是否明文存于 `app_kv`，V1 再迁 OS keychain？（默认 yes）
2. ⏳ Phase 0 PoC 阶段是否提供任何 fallback Provider（例如允许"无 LLM 模式"只测 UI）？（默认 no，强制配置 OpenAI）
3. ⏳ `messageFilter` 的"最近 10 条"是否随时间或 token 数动态调整？（默认 no，先固定）

---

**文档状态**：v3 草案。Provider 配置层已纳入。可启动 Phase 0。
