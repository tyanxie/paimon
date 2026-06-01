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
├── hub/                       # Hub 服务端（registry / router / logger / spawner）
├── utils/                     # 后端共享工具函数（host 判断与警告等）
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
- **停止信号语义备忘** — `paimon hub stop` 用 `process.kill(pid, SIGTERM)` 仅杀 Hub 自身。Hub 虽会 fork 子进程（页面创建的 pi 实例），但这些子进程以 `detached: true`（setsid）脱离 Hub 进程组，所以给 Hub pid 发 SIGTERM **不会**波及它们。**切勿改用 `process.kill(-pid)` 杀进程组**，那会连带杀掉我们刻意保留的 pi 实例（设计上它们应脱离 Hub 独立存活）
- **页面创建实例（Hub spawn）** — Web 点 “+” 输入 cwd → `POST /api/instances` → Hub 在本机 spawn `pi --mode rpc`。关键细节：① RPC 模式从 stdin 读命令，stdin EOF 即退出；而 paimon 对话全程走 WS 不需 stdin，故用 **`O_RDWR` 打开的 FIFO** 作 stdin（pi 自持读写端，永不 EOF，且不依赖外部进程）。② `detached: true` + `unref()` 让 pi 脱离 Hub，Hub 退出/重启都不影响 pi（reparent 到 init），extension 自动重连后继续可用。③ spawn 时注入 `PAIMON_SPAWN_TOKEN` 环境变量，extension 注册时回传该 token，Hub 据此把 spawn 请求与注册成功的实例对应（不靠 pid，规避复用风险）。运行时文件（日志、FIFO）在 `~/.paimon/instances/`，FIFO 在 spawn 后立即 unlink（fd 已持有）
- **页面创建仅限 Hub 本机** — Hub spawn 只能在 Hub 自身所在机器起进程。多机场景是以后加 edge 边缘层后的事情
- **bind 地址与安全** — Hub 默认 bind `127.0.0.1`（仅本机）。`paimon hub start --host <addr>` 可指定；dev 模式用环境变量 `PAIMON_HOST=0.0.0.0 bun run dev`。host 和 port 统一走 `PAIMON_HOST`/`PAIMON_PORT` 环境变量传递（CLI 旗标 → env → hub 读 env）。非 loopback host 时 CLI 启动和 hub 日志都会警告（页面能在任意目录起带 bash 工具的 agent = 远程任意代码执行风险）
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
