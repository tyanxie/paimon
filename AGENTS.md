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

| 组件     | 版本 / 方案                                     |
| -------- | ----------------------------------------------- |
| 运行时   | Bun                                             |
| 语言     | TypeScript 5.8                                  |
| 后端     | Bun 原生 HTTP + WebSocket                       |
| 前端     | React 19 + React Router 7 (history mode)        |
| 样式     | Tailwind CSS 4                                  |
| 构建     | Vite 6                                          |
| 进程管理 | Bun.spawn（detached）+ PID 文件（`~/.paimon/`） |

**关键依赖**: highlight.js, react-markdown, rehype-highlight, remark-gfm, remark-frontmatter, js-yaml, lucide-react

## 项目结构（仅非标准部分）

```
src/
├── protocol/types.ts          # 所有消息类型 + 常量
├── cli/                       # paimon CLI 入口（hub / attach 子命令）
├── hub/                       # Hub 服务端（registry / router / logger）
├── extensions/paimon/         # pi extension（WS 客户端 + 事件序列化 + session 控制）
└── web/                       # React 前端（Vite 构建，入口 src/web/index.html）
    └── src/
        ├── stores/            # useAppState, useSettings（全局状态）
        ├── hooks/             # useWebSocket, useLogoSrc
        ├── utils/             # 工具函数（status 状态判断等）
        └── components/
            ├── ui/            # 通用组件（ModalShell, MobileNavBar 等）
            └── entries/       # 消息渲染器（Markdown, ThinkingBlock, ToolCallCard）
```

## 关键约定

- **pi SDK 行为依赖** — `ctx.sessionManager.getBranch()` 只返回已完成的消息（`appendMessage` 在 `message_end` 触发），streaming 中的消息不在列表中。这是 pi SDK 的行为，非 paimon 控制
- **开发模式不是 Vite dev server** — `bun run dev` 实际执行 `vite build && concurrently`（先构建再 watch），Web 端通过 Hub 的 HTTP 服务访问静态文件，不走 Vite 自带 dev server
- **Hub 启动依赖构建产物** — Hub 启动前 `dist/web/` 必须存在，否则进程直接退出。开发时需先 `vite build` 或使用 `bun run dev`
- **Daemon 进程模型** — Hub 通过 `Bun.spawn` 以 `detached: true`（POSIX setsid，脱离父进程会话/终端）fork 子进程，父进程 `child.unref()` 后立即退出，子进程作为 daemon 常驻。子进程 stdout/stderr 通过文件 fd 直传日志文件（父进程零参与转发，避免 pending IO 挂住父进程）；启动后父进程轮询 `/api/health` 确认就绪。状态文件（PID、端口、日志）存储在 `~/.paimon/`
- **停止信号语义备忘** — 当前 `paimon hub stop` 用 `process.kill(pid, SIGTERM)` 即可，因为 Hub 自身不 fork 任何子进程。未来若 Hub 需要 fork 常驻子进程，应改用 `process.kill(-pid)` 杀整个进程组（配合 detached 的 setsid 语义）
- **CLI 独立于 npm scripts** — `paimon hub start/stop/status/logs` 和 `paimon attach` 是独立的 CLI 工具，入口在 `src/cli/`，不走 `package.json` scripts
- **attach = 迁移而非双向接管** — pi 不支持同一 session 文件被多进程同时写，所以 `paimon attach` 的语义是：先调 `POST /api/instance/:id/shutdown` 关闭目标实例 → 轮询其从列表消失（3s 超时）→ 本地 `pi --session <sessionId>`（cwd=实例 cwd，stdio inherit）。过滤条件为 hostname + cwd 双重匹配（均 realpath 规范化）。被 attach 的原实例会退出由用户负责
- **CLI 全局安装走 `bun link`** — `package.json` 的 `bin` 指向 `src/cli/index.ts`（非编译产物），bun 直接执行带 shebang 的 ts 源码。`bun link` 在 `~/.bun/bin/` 建软链接回 clone 目录，`bun unlink` 解除。整条链路（CLI → daemon fork `src/hub/index.ts` → hub 找 `dist/web`）全程跑 ts 源码，依赖 ① clone 目录不可删/移动 ② 用户机器装有 bun。发布到 npm 需另做编译化改造（webDir / hub fork 路径 / files / 依赖）

## 代码规范

- **注释用中文**，**日志和用户提示用英文**
- Git 提交格式：`type(scope): 描述`（中文描述）
- Extension 开发遵循 pi extension 规范
- **提交需用户确认** — 每次修改完成后，等待用户审阅确认才可执行 `git commit`
- 功能变更后主动检查并更新 AGENTS.md 和 README.md，保持文档与代码一致

## 设计风格（摘要）

参考 macOS 26 Liquid Glass 风格。完整规范见 [docs/design/macos-26-tokens.md](docs/design/macos-26-tokens.md)。

关键要点：浮动毛玻璃面板（`backdrop-filter: blur(30px)` + 半透明底色 + 0.5px 边框）、大圆角（window 26px / panel 18px）、亮暗双模式（`data-theme`）、动态渐变背景（`data-bg`）、响应式（`md:` 768px 断点）、iOS Safe Area 适配。代码高亮使用自定义 CSS 变量 `--hljs-*` 而非第三方主题。
