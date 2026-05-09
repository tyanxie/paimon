# AGENTS.md

本项目是 Paimon — pi coding agent 的远程观察与控制面板。

## 项目结构

```
paimon/
├── src/
│   ├── protocol/                   # 共享协议
│   │   └── types.ts                # 所有消息类型 + 常量
│   │
│   ├── cli/                        # CLI 入口
│   │   ├── index.ts                # paimon 主命令路由
│   │   ├── hub.ts                  # paimon hub start/stop/status/logs
│   │   └── daemon.ts               # fork 子进程 + PID 管理
│   │
│   ├── hub/                        # Hub Server（daemon 进程运行）
│   │   ├── index.ts                # 启动 HTTP + WebSocket
│   │   ├── registry.ts             # 实例注册表、心跳、清理
│   │   ├── router.ts               # 消息路由（Extension / Browser）
│   │   └── logger.ts               # 日志
│   │
│   ├── extensions/paimon/              # pi extension
│   │   ├── index.ts                # 入口：连接 Hub、事件转发
│   │   ├── client.ts               # WebSocket 客户端 + 指数退避重连
│   │   └── serializer.ts           # 事件序列化
│   │
│   └── web/                        # 前端（React + Tailwind）
│       ├── index.html
│       └── src/
│           ├── main.tsx            # React 入口
│           ├── App.tsx             # 根组件
│           ├── index.css           # Tailwind + macOS 26 tokens
│           ├── hooks/              # useWebSocket
│           ├── stores/             # useAppState
│           └── components/         # Sidebar, EventStream
│
├── docs/design/                    # 设计参考
│   ├── macos-26-design-tokens.json # Figma Design Tokens 插件导出
│   ├── macos-26-figma-raw-data.md  # Figma API 原始数据缓存
│   └── macos-26-tokens.md          # 整理后的设计规范速查表
│
├── package.json                    # 依赖 + bin + pi extension 声明
├── tsconfig.json
├── vite.config.ts                  # Vite 配置（root: src/web）
└── .gitignore
```

## 技术选型

- **语言**: TypeScript
- **运行时 / 包管理**: Bun
- **Hub 后端**: Bun 原生 HTTP + WebSocket server
- **前端框架**: React
- **前端路由**: React Router (history mode)
- **样式方案**: Tailwind CSS
- **前端构建**: Vite
- **进程管理**: fork daemon + PID 文件 (~/.paimon/)

## 设计风格

参考 macOS 26 系统设置页 / App Store 的视觉风格（Liquid Glass），设计 token 从 Apple Figma 文件（`av2f5FwZtGoCObPOByH1O0`）提取。

### 设计参考文件

| 文件                                      | 内容                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `docs/design/macos-26-tokens.md`          | 整理后的设计规范速查表（双模式颜色、圆角、阴影、字体、Tailwind 映射） |
| `docs/design/macos-26-design-tokens.json` | Figma Design Tokens 插件原始导出（Dark mode，3782 行）                |
| `docs/design/macos-26-figma-raw-data.md`  | Figma REST API 返回的布局/结构数据缓存                                |

### 核心视觉规范

- 浮动面板布局：sidebar 和 content 是独立的玻璃面板，浮在背景之上
- 动态渐变背景：animated gradient 20s 循环，亮暗双模式各有配色
- 毛玻璃效果（backdrop-filter: blur(30px) + 半透明底色 + 0.5px 边框）
- 大圆角卡片（window 26px / panel 18px / item 8px）
- 柔和阴影（panel: `0 8px 40px rgba(0,0,0,0.08)`）
- 面板间 gap 12px，外层 padding 12px，背景可透出
- 系统字体栈（-apple-system / Inter）
- 亮色/暗色双模式（基于 prefers-color-scheme）

## 架构设计

### 核心架构

中心化 Hub + Extension Client 模式：

- **Hub Server**: 独立长驻进程，默认监听 0.0.0.0:8080，提供 Web UI + WebSocket
- **Pi Extension**: 每个 pi 实例加载，主动连接 Hub 注册自己，转发事件流
- **Web UI**: 单一网页入口，自动发现所有已连接 pi 实例

### 通信协议

Extension → Hub（上报）：

- `register` — 注册实例（cwd、model、sessionName、pid）
- `heartbeat` — 心跳保活
- `event` — 转发 pi 事件（全量转发所有 28 种 pi 事件）
- `state` — 状态变更（idle/streaming）
- `history` — 响应历史请求（getBranch 返回的 session entries）

Hub → Extension（下发）：

- `registered` — 注册确认（返回分配的 instanceId）
- `prompt` — 发送用户消息
- `steer` — 发送 steer 消息
- `abort` — 中止当前操作
- `get_history` — 请求历史消息
- `ping` — 心跳确认

Hub → Browser：

- `instance_list` — 完整实例列表
- `instance_update` — 单个实例变更（connected/disconnected/updated）
- `forwarded_event` — 实时事件转发
- `history` — 历史消息
- `error` — 错误信息

Browser → Hub：

- `list` — 请求实例列表
- `subscribe` / `unsubscribe` — 订阅/取消实例事件流
- `history` — 请求实例历史
- `prompt` / `steer` / `abort` — 操作指令

### Hub 存活探测

三层保障：

1. TCP 层 — WebSocket 连接断开（覆盖正常退出、kill）
2. WS 协议层 — ping/pong 帧（覆盖网络中断）
3. 应用层 — 心跳 15s + 超时 10s（覆盖进程卡死）

### Extension 重连策略

- Hub 未启动时静默忽略，定期重试
- 重连退避：1s → 2s → 5s → 10s → 30s
- 首次断连时通过 `ctx.ui.notify()` 提示用户
- 重连成功时通知

### 数据获取与对话展示

- **历史消息**: `ctx.sessionManager.getBranch()` 获取当前分支完整历史，浏览器订阅时自动请求
- **实时事件**: 全量转发所有 pi 事件（28 种，来自 ExtensionAPI.on() 类型声明）
- **自定义工具状态**: 通过 `tool_execution_end` 事件的 `result.details` 自然获取，无需特殊处理
- **对话展示**: 统一 `Entry[]` 列表，历史 + 实时事件共同维护，详见 `docs/design/conversation-rendering.md`

## CLI 设计

```bash
paimon hub start [--port 8080]    # 启动 Hub daemon
paimon hub stop                   # 停止 Hub
paimon hub status                 # 显示状态
paimon hub logs [--follow]        # 查看日志
```

后台驻守方式：Bun.spawn 子进程 + PID 文件。

状态文件位置：`~/.paimon/`（hub.pid、hub.log、hub.port）

## 开发规范

- 代码注释使用中文
- 日志和用户提示使用英文
- Git 提交格式：`type(scope): 描述`（中文描述）
- Extension 开发遵循 pi extension 规范（参考 pi docs/extensions.md）
- **禁止自行提交**：任何 git commit 必须由用户审阅确认后才可执行，不得主动提交
- **文档同步**：每次功能变更后主动检查并更新 AGENTS.md 和 README.md，保持文档与代码一致

## 安全

- v0.1 局域网裸跑，不做认证
- 远程访问由外部网关处理，项目本身不涉及

## v0.1 功能范围

- [x] Hub 启动/停止/状态
- [x] 实例自动注册 + 心跳探活
- [x] 网页展示所有 pi 实例列表
- [x] 进入某实例查看实时对话流
- [x] 发送消息（prompt / steer）
- [x] abort 按钮
- [x] URL 路由保持选中状态
- [x] Liquid Glass 浮动面板 + 动态渐变背景
- [ ] 移动端优化（后续）
- [ ] tunnel 集成（后续）
- [ ] 认证（后续）
