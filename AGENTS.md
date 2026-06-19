# AGENTS.md

Paimon 是 Pi 的远程控制面板。

中心化 Hub + 边缘化 Edge + Extension Client 架构：Hub Server 为独立常驻进程，Edge 节点在每台服务器上运行并向 Hub 注册，Pi Extension 在每个 pi 实例中加载并向本机 Edge 注册，Web UI 通过 Hub 发现所有实例。

## Commands

```bash
bun run dev      # 开发模式：构建前端 + 启动 Hub + watch
bun run build    # 仅构建前端（Vite）
bun run start    # 直接启动 Hub
bun test         # 运行测试

bun run scripts/build-binaries.ts          # 编译全平台二进制（包含 vite build）
bun run scripts/build-binaries.ts --local  # 仅编译当前平台
bun run scripts/prepare-npm-packages.ts    # 从编译产物生成 npm 可发布目录
```

## 技术选型

| 组件     | 版本 / 方案                                                           |
| -------- | --------------------------------------------------------------------- |
| 运行时   | Bun                                                                   |
| 语言     | TypeScript 5.8                                                        |
| 后端     | Bun 原生 HTTP + WebSocket                                             |
| 前端     | React 19 + React Router 7 (history mode)                              |
| 样式     | Tailwind CSS 4                                                        |
| 构建     | Vite 6                                                                |
| 进程管理 | Bun.spawn（detached）+ 状态文件（`~/.paimon/hub.json` / `edge.json`） |

**关键依赖**: highlight.js, react-markdown, rehype-highlight, remark-gfm, remark-frontmatter, js-yaml, lucide-react, i18next, react-i18next

## 项目结构（仅非标准部分）

```
src/
├── protocol/types.ts          # 所有消息类型 + 常量（含 Edge 协议）
├── cli/                       # paimon CLI 入口（hub / edge / attach 子命令）
├── hub/                       # Hub 服务端（auth / edge-registry / router / pending / logger）
├── edge/                      # Edge 服务端（registry / router / upstream / spawner / browser）
├── utils/                     # 后端共享工具函数（host 判断与警告等）
├── extensions/paimon/         # pi extension（WS 客户端 + 事件序列化 + session 控制）
└── web/                       # React 前端（Vite 构建，入口 src/web/index.html）
    └── src/
        ├── i18n/              # 国际化（i18next 配置 + locale 文件）
        ├── stores/            # useAppState, useSettings（全局状态）
        ├── hooks/             # useWebSocket, useLogoSrc
        ├── utils/             # 工具函数（status 状态判断、authFetch 等）
        └── components/
            ├── ui/            # 通用组件（ModalShell, MobileNavBar 等）
            └── entries/       # 消息渲染器（Markdown, ThinkingBlock, ToolCallCard）
scripts/
├── build-binaries.ts          # 多平台编译脚本（vite build + bun build --compile）
└── prepare-npm-packages.ts    # 生成 npm 可发布目录结构
bin/
└── paimon.cjs                 # Node.js 启动器（检测平台 → 找平台包二进制 → exec）
```

## 关键约定

- **pi SDK 行为依赖** — `ctx.sessionManager.getBranch()` 只返回已完成的消息（`appendMessage` 在 `message_end` 触发），streaming 中的消息不在列表中。这是 pi SDK 的行为，非 paimon 控制
- **四层架构：Web → Hub → Edge → Pi** — Hub 不再直接连接 pi extension，所有 pi 通信通过 Edge 中转。Hub 只与 Edge 和 Browser 交互，Edge 只与本机 pi 和 Hub 交互
- **Edge 是本机 pi 的聚合代理** — 每台服务器跑一个 Edge daemon，管理本机所有 pi 实例，通过单条 WS 多路复用上报 Hub
- **Edge 端口与 Hub 端口独立** — Hub 默认 :8080（`PAIMON_PORT`），Edge 默认 :8033（`PAIMON_EDGE_PORT`）。Pi extension 连接本机 Edge 端口
- **EdgeId 默认为 hostname** — `PAIMON_EDGE_ID` 环境变量或 `--edge-id` 可覆盖，用于区分多台机器
- **Grace period 在 Edge 级别** — Edge 断连时其下所有 instance 整体进入 grace period，超时后批量移除
- **开发模式不是 Vite dev server** — `bun run dev` 实际执行 `vite build && concurrently`（先构建再 watch），Web 端通过 Hub 的 HTTP 服务访问静态文件，不走 Vite 自带 dev server
- **Hub 启动依赖构建产物** — Hub 启动前 `dist/web/` 必须存在，否则进程直接退出。开发时需先 `vite build` 或使用 `bun run dev`
- **Daemon 进程模型** — Hub 和 Edge 均通过 `Bun.spawn` 以 `detached: true`（POSIX setsid）fork 子进程，父进程 `child.unref()` 后立即退出。stdout/stderr 通过文件 fd 直传日志文件；启动后轮询 `/api/health` 确认就绪。状态文件存储在 `~/.paimon/`。Daemon 通过 `PAIMON_ROLE=hub|edge` 环境变量区分角色——源码模式 spawn `[bun, cli/index.ts]`，编译模式 spawn `[process.execPath]`（二进制自身），CLI 入口顶部根据该变量路由到对应模块
- **停止信号语义** — `paimon hub stop` / `paimon edge stop` 用 SIGTERM 仅杀对应 daemon 自身。Edge spawn 的 pi 子进程以 `detached: true`（setsid）脱离 Edge 进程组，不会被连带杀死
- **页面创建实例通过 Edge** — Web 点 “+” 选择 Edge 节点 + 输入 cwd → `POST /api/instances` → Hub 向指定 Edge 发 spawn 指令 → Edge 在本机 spawn `pi --mode rpc`。关键细节：① RPC 模式从 stdin 读命令，stdin EOF 即退出；而 paimon 对话全程走 WS 不需 stdin，故用 **`O_RDWR` 打开的 FIFO** 作 stdin。② `detached: true` + `unref()` 让 pi 脱离 Edge，Edge 退出/重启不影响 pi。③ spawn 时注入 `PAIMON_SPAWN_TOKEN`，extension 注册时回传该 token，Edge 据此把 spawn 请求与注册成功的实例对应，然后上报 Hub。运行时文件在 `~/.paimon/instances/`
- **页面创建实例由 Edge 执行** — Hub 将 spawn 指令转发给指定 Edge，Edge 在本机起进程。多机场景下前端选择目标 Edge 节点
- **Hub→Edge request-response 通用模式** — `src/hub/pending.ts` 提供 `PendingRequests<T>` 泛型工具，基于 token 匹配 WS 异步请求与响应。spawn 和目录浏览（browse）均使用此模式
- **目录浏览 API** — `GET /api/edges/:edgeId/browse?path=xxx`，Hub 转发给 Edge 执行 readdir。Edge 解析 parent/prefix（路径以 `/` 结尾列全部，否则以末段为前缀过滤），仅返回子目录，默认隐藏 dotfiles（前缀以 `.` 开头时显示），最多 200 条（截断时标记 `truncated`）。前端据此实现类 VS Code 的路径补全选择器
- **bind 地址与安全** — Hub 和 Edge 默认 bind `127.0.0.1`（仅本机）。`--host` 可指定；非 loopback 时 CLI 和日志都会警告
- **Access Token 认证** — Hub 启动时生成或接收 access token（优先级：`PAIMON_ACCESS_TOKEN` 环境变量 > `--token` 参数 > 自动生成），写入 `hub.json`。Edge/Browser/HTTP API 连接 Hub 时必须携带 token（WS 通过 `?token=xxx`，HTTP 通过 `Authorization: Bearer xxx`）。`/api/health` 不需认证。`PAIMON_AUTH_DISABLED=1` 可关闭认证（仅开发调试）
- **Token 生命周期** — token 存储于 `hub.json`，随 `paimon hub stop` 删除而失效。`paimon hub restart` 默认继承旧 token（显示来源为 `inherited`）。Pi Extension → Edge 不需认证（Edge 仅 bind loopback，天然同机信任）
- **Edge token 来源** — 优先级：`PAIMON_ACCESS_TOKEN` 环境变量 > `--token` 参数 > 同机 hub.json fallback
- **CLI 独立于 npm scripts** — `paimon hub start/stop/status/logs`、`paimon edge start/stop/status/logs` 和 `paimon attach` 是独立的 CLI 工具，入口在 `src/cli/`，不走 `package.json` scripts
- **attach = 迁移而非双向接管** — pi 不支持同一 session 文件被多进程同时写，所以 `paimon attach` 的语义是：先调 `POST /api/instance/:id/shutdown` 关闭目标实例 → 轮询其从列表消失（3s 超时）→ 本地 `pi --session <sessionId>`（cwd=实例 cwd，stdio inherit）。过滤条件为 hostname + cwd 双重匹配（均 realpath 规范化）。被 attach 的原实例会退出由用户负责
- **CLI 全局安装走 `bun link`** — `package.json` 的 `bin` 指向 `src/cli/index.ts`（非编译产物），bun 直接执行带 shebang 的 ts 源码。`bun link` 在 `~/.bun/bin/` 建软链接回 clone 目录，`bun unlink` 解除。CLI 入口统一为 `src/cli/index.ts`，通过 `PAIMON_ROLE` 环境变量区分角色（见 Daemon 进程模型）
- **npm 分发模式** — 主包 `@tyanxie/paimon`（含 `bin/paimon.cjs` 启动器 + extension 源码）+ 4 个平台包 `@tyanxie/paimon-{darwin-arm64,darwin-x64,linux-arm64,linux-x64}`（含编译二进制 + web 资产）。主包通过 `optionalDependencies` 引用平台包，npm install 时只下载匹配当前系统的那一个
- **编译模式 web 目录寻址** — 源码模式从 `resolve(import.meta.dir, "../../dist/web")` 读取；编译模式从 `resolve(dirname(process.execPath), "../web")` 读取（二进制在 `bin/paimon`，web 在同级 `web/`）。判断条件：`import.meta.path.startsWith("/$bunfs/")`
- **版本号来源** — 根 `package.json` 的 `version` 字段为唯一来源，`prepare-npm-packages.ts` 读取并写入所有生成的包
- **图片传输协议** — prompt 消息的 payload 支持可选的 `images?: ImagePayload[]` 字段（`{ data: base64, mimeType: string }`），从 Browser → Hub → Edge → Extension 透传。Extension 端收到后组装为 pi SDK 的 `(TextContent | ImageContent)[]` 调用 `sendUserMessage`。前端通过 Canvas API 压缩图片（max 2048px，JPEG quality 0.85，上限 5MB），不依赖外部库。Bun WS 默认 16MB payload 限制足够

## 代码规范

- **注释用中文**，**日志用英文**（用户提示可用中文）
- Git 提交格式：`type(scope): 描述`（中文描述）
- Extension 开发遵循 pi extension 规范
- **提交需用户确认** — 每次修改完成后，等待用户审阅确认才可执行 `git commit`
- **发版** — 修改 `package.json` version → `git commit -am "Release version x.y.z"`。版本号由用户指定，未提供时须询问
- 功能变更后主动检查并更新 AGENTS.md 和 README.md，保持文档与代码一致
- **localStorage key 格式** — 前端 localStorage 统一使用 `paimon:camelCase` 命名格式（如 `paimon:appearance`、`paimon:accessToken`、`paimon:language`）
- **前端国际化（i18n）** — 使用 `i18next` + `react-i18next`，fallback 语言为简体中文。所有用户可见的 UI 文本必须通过 `t('namespace.key')` 获取，禁止硬编码。新增 UI 文本时需同时更新 `src/web/src/i18n/zh-CN.ts` 和 `en.ts`。key 按模块分组（如 `sidebar.xxx`、`settings.xxx`）。语言偏好存储在 `paimon:language`

## 设计风格（摘要）

参考 macOS 26 Liquid Glass 风格。完整规范见 [docs/design/macos-26-tokens.md](docs/design/macos-26-tokens.md)。

关键要点：浮动毛玻璃面板（`backdrop-filter: blur(30px)` + 半透明底色 + 0.5px 边框）、大圆角（window 26px / panel 18px）、亮暗双模式（`data-theme`）、动态渐变背景（`data-bg`）、响应式（`md:` 768px 断点）、iOS Safe Area 适配。代码高亮使用自定义 CSS 变量 `--hljs-*` 而非第三方主题。
