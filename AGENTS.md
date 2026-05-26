# AGENTS.md

Paimon 是 Pi 的远程控制面板。

中心化 Hub + Extension Client 架构：Hub Server 为独立常驻进程，Pi Extension 在每个 pi 实例中加载并向 Hub 注册，Web UI 为单一页面自动发现所有实例。

## Commands

```bash
bun run dev      # 开发模式：构建前端 + 启动 Hub + watch
bun run build    # 仅构建前端（Vite）
bun run start    # 直接启动 Hub
bun test         # 运行测试
```

## 技术选型

| 组件     | 版本 / 方案                              |
| -------- | ---------------------------------------- |
| 运行时   | Bun                                      |
| 语言     | TypeScript 5.8                           |
| 后端     | Bun 原生 HTTP + WebSocket                |
| 前端     | React 19 + React Router 7 (history mode) |
| 样式     | Tailwind CSS 4                           |
| 构建     | Vite 6                                   |
| 进程管理 | Bun.spawn + PID 文件（`~/.paimon/`）     |

**关键依赖**: highlight.js, react-markdown, rehype-highlight, remark-gfm, remark-frontmatter, js-yaml, lucide-react

## 项目结构（仅非标准部分）

```
src/
├── protocol/types.ts          # 所有消息类型 + 常量
├── cli/                       # paimon CLI 入口（hub 子命令）
├── hub/                       # Hub 服务端（registry / router / logger）
├── extensions/paimon/         # pi extension（WS 客户端 + 事件序列化 + session 控制）
└── web/                       # React 前端（Vite 构建，入口 src/web/index.html）
    └── src/
        ├── stores/            # useAppState, useSettings（全局状态）
        ├── hooks/             # useWebSocket, useLogoSrc
        └── components/
            ├── ui/            # 通用组件（ModalShell, MobileNavBar 等）
            └── entries/       # 消息渲染器（Markdown, ThinkingBlock, ToolCallCard）
```

## 关键约定

- **pi SDK 行为依赖** — `ctx.sessionManager.getBranch()` 只返回已完成的消息（`appendMessage` 在 `message_end` 触发），streaming 中的消息不在列表中。这是 pi SDK 的行为，非 paimon 控制
- **开发模式不是 Vite dev server** — `bun run dev` 实际执行 `vite build && concurrently`（先构建再 watch），Web 端通过 Hub 的 HTTP 服务访问静态文件，不走 Vite 自带 dev server
- **Hub 启动依赖构建产物** — Hub 启动前 `dist/web/` 必须存在，否则进程直接退出。开发时需先 `vite build` 或使用 `bun run dev`
- **Daemon 进程模型** — Hub 通过 `Bun.spawn` fork 子进程运行，父进程退出后子进程继续（`child.unref()`）。状态文件（PID、端口、日志）存储在 `~/.paimon/`
- **CLI 独立于 npm scripts** — `paimon hub start/stop/status/logs` 是独立的 CLI 工具，入口在 `src/cli/`，不走 `package.json` scripts

## 代码规范

- **注释用中文**，**日志和用户提示用英文**
- Git 提交格式：`type(scope): 描述`（中文描述）
- Extension 开发遵循 pi extension 规范
- **提交需用户确认** — 每次修改完成后，等待用户审阅确认才可执行 `git commit`
- 功能变更后主动检查并更新 AGENTS.md 和 README.md，保持文档与代码一致

## 设计风格（摘要）

参考 macOS 26 Liquid Glass 风格。完整规范见 [docs/design/macos-26-tokens.md](docs/design/macos-26-tokens.md)。

关键要点：浮动毛玻璃面板（`backdrop-filter: blur(30px)` + 半透明底色 + 0.5px 边框）、大圆角（window 26px / panel 18px）、亮暗双模式（`data-theme`）、动态渐变背景（`data-bg`）、响应式（`md:` 768px 断点）、iOS Safe Area 适配。代码高亮使用自定义 CSS 变量 `--hljs-*` 而非第三方主题。
