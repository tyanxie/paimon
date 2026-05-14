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
│           ├── hooks/              # useWebSocket, useLogoSrc
│           ├── stores/             # useAppState, useSettings
│           └── components/         # Sidebar, EventStream, Settings
│               ├── ui/             # 通用 UI 组件 (ModalShell, MobileNavBar, ModelSelector)
│               └── entries/        # 消息渲染器
│                   ├── index.tsx   # EntryItem 主分发组件
│                   ├── Markdown.tsx
│                   ├── ThinkingBlock.tsx
│                   └── ToolCallCard.tsx
│
├── docs/design/                    # 设计参考
│   ├── macos-26-design-tokens.json # Figma Design Tokens 插件导出
│   ├── macos-26-figma-raw-data.md  # Figma API 原始数据缓存
│   ├── macos-26-tokens.md          # 整理后的设计规范速查表
│   ├── logos/                      # 按 data-bg/data-theme 分组的 logo 产物
│   └── generate-logo.py            # logo 生成脚本
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

- 浮动面板布局：Sidebar 保持毛玻璃导航面板；右侧对话区为开放渐变画布，顶部实例/分支信息与底部 composer 作为同宽悬浮毛玻璃控件浮在内容之上
- 动态渐变背景：animated gradient 20s 循环，亮暗双模式各有配色
- 毛玻璃效果（backdrop-filter: blur(30px) + 半透明底色 + 0.5px 边框）；Popover 使用 `glass-popover` 对齐 `glass-panel` 材质
- 大圆角卡片（window 26px / panel 18px / item 8px）
- 柔和阴影（panel: `0 8px 40px rgba(0,0,0,0.08)`）
- 面板间 gap 12px，外层 padding 12px，背景可透出
- 系统字体栈（-apple-system / Inter）
- 亮色/暗色双模式（基于 data-theme 属性，支持手动切换 + 跟随系统）
- 背景渐变预设（雾/极光/余烬，基于 data-bg 属性）；logo 按 data-bg + data-theme 使用对应四色渐变版本
- 设置页（/settings）：外观配置（主题 + 背景），存储于 localStorage（paimon:appearance / paimon:background）
- 代码高亮：不使用第三方 hljs 主题，自定义 CSS 变量配色（`--hljs-*`），跟随 light/dark 主题自动切换；配色低饱和度，与 macOS 26 label 色系协调
- 响应式布局：Tailwind `md:` 断点（768px）区分移动/桌面；移动端 Sidebar 隐藏、根路由全屏实例列表、对话页 MobileNavBar 导航；不分离 Layout 组件，同一份 JSX + 响应式类
- iOS 适配：`viewport-fit=cover` + `env(safe-area-inset-bottom)` 避开圆角/Home Indicator；`maximum-scale=1` 禁止输入框自动缩放；`interactive-widget=resizes-content` + `useViewportHeight` hook 处理键盘弹出时视口缩放；内联 `<style>` 设置 html background-color 作为 safe area 兜底色（Safari 仅从内联样式读取）
- Sidebar logo 使用固定高度（`h-[34px]`）匹配标题两行文字，避免 `display:none` 转换时百分比高度解析失败

## 架构设计

### 核心架构

中心化 Hub + Extension Client 模式：

- **Hub Server**: 独立长驻进程，默认监听 0.0.0.0:8080，提供 Web UI + WebSocket
- **Pi Extension**: 每个 pi 实例加载，主动连接 Hub 注册自己，转发事件流
- **Web UI**: 单一网页入口，自动发现所有已连接 pi 实例

### 通信协议

Extension → Hub（上报）：

- `register` — 注册实例（cwd、model、sessionName、pid、availableModels）
- `heartbeat` — 心跳保活
- `event` — 转发 pi 事件（仅前端实际使用的 message_start/update/end）
- `state` — 状态变更（status/contextUsage/gitBranch/model，各字段均可选，按需更新）
- `history` — 响应历史请求（getBranch 返回的 session entries，按 turn 分页）

Hub → Extension（下发）：

- `registered` — 注册确认（返回分配的 instanceId）
- `prompt` — 发送用户消息
- `steer` — 发送 steer 消息
- `abort` — 中止当前操作
- `set_model` — 切换模型（provider + id）
- `get_history` — 请求历史消息（支持 offset/limit 分页）
- `ping` — 心跳确认

Hub → Browser：

- `instance_list` — 完整实例列表
- `instance_update` — 单个实例变更（connected/disconnected/updated）
- `forwarded_event` — 实时事件转发
- `history` — 历史消息（含 hasMore 分页标记）
- `error` — 错误信息

Browser → Hub：

- `list` — 请求实例列表
- `subscribe` / `unsubscribe` — 订阅/取消实例事件流
- `history` — 请求实例历史（支持 offset/limit 分页）
- `prompt` / `steer` / `abort` — 操作指令
- `set_model` — 切换实例模型（provider + id）

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
- **重要：`getBranch()` 只返回已完成的消息**（`appendMessage` 在 `message_end` 时才调用），正在 streaming 的消息不在其中
- **分页加载**: 按 turn 分组（每个 user message 开始新 turn），支持 offset + limit 参数；实例切换/刷新请求不带 offset，加载更早历史时 offset 取当前已完成 entries 长度
- **前端数据分层**: Web 侧只保存当前实例的已完成 `entries` 与当前 `streamingEntry`，实例切换时清空对话区并重新请求 history；history 刷新响应 replace entries，加载更早历史响应 prepend entries
- **草稿隔离**: 输入框草稿按实例 ID 存储，切换实例时显示目标实例草稿；发送成功后只清空当前实例草稿
- **Streaming 恢复**: 刷新页面后 `message_update` 隐式创建 streamingEntry，无需先收到 `message_start`
- **自动滚动**: 实例切换/刷新 history 首包完成后自动滚到底部；用户在底部时自动跟随新内容；history prepend 期间通过稳定 entry key、禁用浏览器滚动锚定、deep visible anchor / entry anchor 恢复和 ResizeObserver anchor pin 保持当前可见内容位置，并暂停 isAtBottom 判断避免误触发；不在底部时显示浮动「滚动到底部」按钮（Liquid Glass 风格，底部居中）
- **自定义工具状态**: 通过 `tool_execution_end` 事件的 `result.details` 自然获取，无需特殊处理
- **Tool 弹窗架构**: 每个工具可拥有专属 DetailModal（ReadDetailModal / BashDetailModal / WriteDetailModal / EditDetailModal），未定制的工具使用 DefaultDetailModal（JSON args + 纯文本 result）；共享 ModalShell 外壳组件
- **代码高亮**: Read/Write/Bash 弹窗通过 MarkdownRenderer 渲染代码块，复用 rehype-highlight（无额外 hljs 实例），扩展名→语言映射表覆盖常见文件类型
- **Diff 渲染**: Edit 弹窗从 `result.details.diff` 取已生成的 unified diff，前端逐行解析前缀着色（红删绿增灰上下文），配色跟随 light/dark 主题切换
- **API 错误展示**: 助手消息 stopReason="error" 时渲染 ErrorCard；短 detail 直接内联，长 detail (>200字符) 点击卡片弹出 ModalShell 展示完整错误信息（结构化解析 type/message/requestId）
- **会话信息展示**: Extension 在 message_end/session_compact 时发送 contextUsage + gitBranch；Web 侧边栏渲染上下文进度条（绿/橙/红阈值），顶部悬浮栏展示 instance name 与 git branch，底部 composer 内展示 context usage + model
- **对话展示**: 统一渲染 `[...entries, streamingEntry?]`，刷新 replace、历史 prepend 与 streaming 实时更新互不冲突，详见 `docs/design/conversation-rendering.md`

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
- **提交需用户确认**：每次修改完代码后，需等待用户审阅确认后才可执行 git commit
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
- [x] 移动端响应式布局（v0.1）
- [ ] tunnel 集成（后续）
- [ ] 认证（后续）
