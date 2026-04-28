# Novel Local Studio

本地优先的长篇小说 / 网文创作桌面应用。

## 快速开始

```bash
cp .env.example .env
pnpm install

pnpm dev        # 桌面端（Tauri + Mastra + Web）
pnpm dev:web    # 纯 Web 端（不启动 Tauri）
pnpm build      # 生产构建
```

开发模式服务地址：

| 服务 | 地址 |
|---|---|
| Web 前端 (Vite) | `http://127.0.0.1:1420` |
| Mastra sidecar | `http://127.0.0.1:4312` |
| Axum 代理 / API | `http://127.0.0.1:4311` |

---

## 文档

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 技术架构：层次结构、目录结构、AI 集成数据流、多智能体架构、Mastra 集成决策、Sidecar 机制 |
| [docs/api.md](docs/api.md) | API 端点参考、数据库表结构 |
| [docs/features.md](docs/features.md) | 产品功能现状、页面路由状态、待开发列表 |
| [docs/roadmap.md](docs/roadmap.md) | 开发路线图：Supervisor 模式、记忆系统、Phase 1-4 规划 |

---

## 已知事项

- **开发用 stub 二进制**：`app/src-tauri/binaries/mastra-server-<triple>` 是空 shell script，仅用于让 `cargo check` 通过。正式构建前须运行 `pnpm build:sidecar` 替换为真实二进制。
- **LLM 占位**：当前 AI 生成接口返回占位响应，需在设置页配置真实 Provider 后生效。
- **`with-env.mjs` 废弃警告**：Node.js DEP0190 警告来自 `shell: true` 模式，不影响功能，`dev-services.mjs` 已改用 `shell: false` 规避。
