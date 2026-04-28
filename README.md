# Novel Local Studio

> AI-first, local-first novel writing desktop application — double-click to install, zero command-line configuration.

Novel Local Studio is a desktop writing tool inspired by the "Claude Desktop / opencode" experience: **file tree on the left, read-only content in the center, multi-agent AI chat on the right**. All creation, modification, and expansion is driven entirely through AI conversations — humans only read, review, and make decisions.

## Key Features

- **AI-First** — All content is read-only; any modification is done by AI tool calls. You are the director and reviewer.
- **Multi-Agent Collaboration** — One Supervisor agent + 4 specialized sub-agents (Architect, Chronicler, Editor, LoreKeeper) working together.
- **Local-First** — All data stored on your disk. No cloud dependency. Only connects to the internet when calling LLMs.
- **Zero-Config Install** — `.dmg` / `.msi` / `.AppImage` with bundled Node.js sidecar. No need for Node.js, Python, or Docker.
- **Novel-Friendly** — Supports 500k+ word novels with full-text search (FTS5 + Chinese word segmentation) and semantic vector search.
- **Flexible LLM Configuration** — Bring your own LLM provider (OpenAI, Anthropic, DeepSeek, Ollama, or any OpenAI-compatible endpoint). Each agent can use a different model.

### AI Agents

| Agent | Role | Responsibility |
|---|---|---|
| **Supervisor** | Editor-in-Chief | Task understanding, routing, synthesizing results |
| **Architect** | 架构师 | Worldbuilding, settings, outlines, character profiles, plot structure |
| **Chronicler** | 执笔者 | Writing prose (chapters, scenes, dialogue) based on outlines and settings |
| **Editor** | 润色师 | Rewriting, pacing, dialogue polish, style adjustments (no plot changes) |
| **LoreKeeper** | 设定守护者 | Consistency validation, fact-checking names/timelines/locations/rules |

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Desktop Shell | **Tauri 2.x** | Small bundle, Rust sandbox, native sidecar support |
| Frontend | **React 18 + TypeScript** | UI framework |
| Styling | **TailwindCSS 4** | Utility-first CSS |
| AI Chat UI | **@assistant-ui/react** | Accessible chat primitives with native tool-call rendering |
| AI SDK | **Vercel AI SDK v5** | Streaming chat state management |
| Markdown | **streamdown** | Streaming-optimized Markdown renderer |
| File Tree | **react-arborist** | Virtualized, keyboard-accessible tree |
| Panels | **react-resizable-panels** | IDE-style resizable split panes |
| State | **Zustand** | Lightweight state management |
| Backend Framework | **Mastra** | AI agent framework with agent orchestration |
| Backend Runtime | **Node.js 22 (sidecar)** | Sidecar process managed by Tauri |
| Metadata/Business DB | **LibSQL** | Single-file SQLite-compatible database |
| Vector Store | **LibSQLVector** | Vector embeddings (same database file) |
| Full-Text Search | **better-sqlite3 + FTS5** | Chinese-capable full-text search with jieba tokenizer |
| Embedding Model | OpenAI `text-embedding-3-small` | 1536-dimensional vector embeddings (MVP) |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Tauri App (Rust main process)                                     │
│                                                                    │
│  ┌──────────────────────┐    ┌─────────────────────────────────┐ │
│  │ WebView (Frontend)   │    │ Sidecar (Node 22)               │ │
│  │                      │    │                                 │ │
│  │ React + Tailwind     │    │ Mastra Server (Hono)            │ │
│  │ assistant-ui         │◄──►│  ├─ Supervisor Agent            │ │
│  │ Vercel AI SDK        │HTTP│  ├─ 4 Sub-Agents                │ │
│  │                      │    │  ├─ Tools (CRUD + Search)       │ │
│  └──────────────────────┘    │  ├─ Memory (LibSQL)             │ │
│                               │  ├─ Vector (LibSQLVector)      │ │
│                               │  └─ FTS (better-sqlite3)       │ │
│                               └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- **Tauri main process** spawns the Node.js sidecar, probes for a free port, and exposes the server URL to the frontend.
- **Mastra** provides the Supervisor + sub-agent orchestration, memory management, and vector storage.
- **All data** lives in a single `app.db` SQLite file in the user's application data directory.
- **Frontend is read-only** — all modifications go through AI tool calls via the chat endpoint.

## Getting Started (Development)

### Prerequisites

- **Node.js** >= 22
- **pnpm** >= 10
- **Rust** (for Tauri native compilation)

### Setup

```bash
# Install dependencies
pnpm install

# Start development (Tauri desktop app)
pnpm dev

# Start web-only development (browser)
pnpm dev:web

# Start Mastra backend only
pnpm dev:mastra

# Type check all packages
pnpm typecheck
```

### Build

```bash
# Build Mastra backend
pnpm build:mastra

# Build desktop app (macOS .dmg, Windows .msi, Linux .AppImage)
pnpm build
```

## Project Structure

```
novel-local-studio/
├── app/                   # Tauri + React frontend
│   ├── src/
│   │   ├── library/       # Book tree, document reader, thread list
│   │   ├── chat/          # AI chat panel
│   │   ├── settings/      # Provider config, agent settings, model bindings
│   │   ├── splash/        # Startup screen
│   │   └── components/ui/ # shadcn/ui components
│   └── src-tauri/         # Rust backend (sidecar management)
├── mastra/                # Node.js backend
│   └── src/
│       ├── agents/        # Supervisor + 4 sub-agents
│       ├── tools/         # AI tools (CRUD + search)
│       ├── db/            # LibSQL, FTS5, vector storage
│       ├── llm/           # Provider registry and model bindings
│       ├── rag/           # Chunking, embedding, indexing
│       └── server.ts      # Hono HTTP server entry point
├── scripts/               # Build scripts (download Node, bundle Mastra, prepare resources)
├── docs/                  # Documentation
│   └── design.md          # Full design document (v3)
└── package.json           # Workspace root
```

## Documentation

- **[design.md](./docs/design.md)** — Complete architecture and design document covering product positioning, tech stack decisions, multi-agent design, data model, and implementation roadmap.

## License

Private project. All rights reserved.
