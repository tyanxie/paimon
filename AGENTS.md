# AGENTS.md

Paimon 是 Pi 的远程控制面板，采用 Web → Hub → Edge → Pi 架构。Hub 是独立常驻进程，每台服务器上的 Edge 管理本机 Pi 实例，Pi Extension 向本机 Edge 注册。

## Commands

```bash
bun run dev      # 构建前端并启动 Hub 与构建 watch
bun run build    # 构建前端
bun run start    # 启动 Hub
bunx tsc --noEmit # 类型检查
bun test         # 运行业务测试

bun run scripts/build-binaries.ts          # 编译全部支持的平台
bun run scripts/build-binaries.ts --local  # 编译当前平台
bun run scripts/prepare-npm-packages.ts     # 生成 npm 发布目录
```

## 开发方式

- 围绕当前需求修改相关代码，代码检查采用 `bunx tsc --noEmit`。
- 保留重要业务逻辑测试，按改动范围选择运行相关用例。纯样式调整无需修改或运行测试。
- DOM 测试通过 `bunfig.toml` preload 加载 happy-dom 环境；Motion 功能测试使用 `MotionConfig reducedMotion="always"`，检查操作、状态、焦点与资源释放。
- 前端修改后执行 `bun run build && paimon hub restart`，Edge 按实际变更需要重启。
- 页面观感、真实浏览器交互与性能由用户检查。除非用户明确要求，Agent 不主动启动或使用浏览器检查页面，也不将浏览器检查列为待办或补充验证事项。
- 文档记录目标、架构、交互原则和重要决策，具体视觉参数与实现信息从源码获取。功能、使用方式或重要设计发生变化时更新相关文档。

## 项目入口

- `src/protocol/types.ts`：消息类型与协议常量。
- `src/cli/`：Hub、Edge、attach、update、version 命令。
- `src/hub/`：认证、Edge 注册、HTTP 与 WebSocket 路由。
- `src/edge/`：本机实例注册、Hub 上游连接、实例创建与目录浏览。
- `src/extensions/paimon/`：Pi Extension、事件转发与 session 控制。
- `src/utils/`：后端共享环境、日志与时区工具。
- `src/web/`：React 前端，入口为 `src/web/index.html`。
- `scripts/` 与 `bin/paimon.cjs`：二进制构建、npm 发布与平台启动器。

运行时使用 Bun，前端使用 React、React Router、Tailwind CSS 和 Vite；状态管理使用 Zustand，国际化使用 i18next。依赖与版本查看 `package.json`。

## 架构与数据约束

- Hub 通过 Edge 与 Pi 通信。每个 Edge 使用一条上游 WebSocket 汇总本机实例；Edge 断连后的 grace period 按整个节点管理。
- Edge 注册实例时同步当前 `status`；未提供状态时，已有实例保留当前状态，全新实例使用 `idle`。`settledOutcome` 随任务结束状态传递。
- Pi SDK 的 `getBranch()` 只返回已完成的消息。流式消息与原始历史分别管理，分页使用已完成的原始条目数量。
- 工具通过 `toolCallId` 关联，历史结果优先；运行状态来自真实事件，缺少信息时保留未知状态。消息时间与工具耗时分别使用已有数据。
- `agent_settled` 表示重试、压缩恢复和排队消息均已结束。Extension 在此事件中更新 `idle`，Web 仅为 `completed` 发送任务完成通知。
- 同一 session 文件由单个 Pi 进程写入。`paimon attach` 关闭远端目标实例后，在对应目录打开其 session。
- 系统级错误使用 `error`，实例操作错误使用 `instance_error`，后者携带触发操作的 `action`。
- prompt 图片通过 Web、Hub、Edge 和 Extension 传递，保持内容与 MIME type；前端压缩逻辑位于 `src/web/src/utils/image.ts`。

## 服务与部署

- Hub 和 Edge 的地址、端口独立配置。默认 bind loopback；非 loopback 部署通过可信网络或 TLS 反向代理访问。
- Hub 的 HTTP API、Browser 和 Edge 连接使用 Access Token 认证。Pi Extension 连接本机 Edge，Edge 的本机信任依赖 loopback 限制。
- Hub 启动依赖 `dist/web/`。开发模式通过 Hub 提供静态页面，Vite 执行构建 watch。
- 子路径部署由 Hub 处理 base path 并注入页面，Web 的 Router、API 和 WebSocket 使用统一路径前缀；Vite 保留相对资产路径。
- Hub 和 Edge 使用 detached 子进程及状态文件管理 daemon，`PAIMON_ROLE` 选择进程角色。结构化日志使用 `rotating-file-stream`，daemon 入口初始化系统时区。
- Edge 创建的 Pi 进程独立于 Edge 生命周期。RPC stdin 使用以 `O_RDWR` 打开的 FIFO，spawn token 关联创建请求与实例注册；stderr 与 pidfile 用于诊断和日志清理。
- Hub 与 Edge 之间的异步请求通过 token 匹配响应，目录浏览在目标 Edge 执行。
- 自更新识别实际安装来源，并显式传递安装 prefix；来源无法识别时提供明确错误。源码更新要求工作区干净且能够 fast-forward。
- `global-directory` 仅用于 yarn/pnpm 目录识别；编译模式禁止使用其 `npm.prefix` 兜底。
- npm 主包包含启动器与 Extension，平台包包含二进制和 Web 资产。源码模式与编译模式分别定位 Web 目录；版本号来自根 `package.json`。

## 前端原则

- 采用 macOS 26 Liquid Glass 风格，颜色、材质、字体和控件的设计参考见 [macOS 26 Design Tokens](docs/design/macos-26-tokens.md)。保留亮暗主题及 `mist`、`aurora`、`ember` 颜色组。玻璃材质用于导航与控制区域，正文优先保证可读性。
- 对话按用户消息组织回复，正文分隔连续工具执行区域；保留工具、thinking、系统事件与正文的原始顺序。展开状态与阅读位置保持用户选择。
- 公共控件统一同类操作与状态，桌面保持紧凑，触摸设备提供充分操作范围；兼顾键盘、Safe Area 和 reduced motion。
- Mermaid 使用严格安全配置与 DOMPurify 清理 SVG，保留源码局部样式。渲染串行执行，异步更新保留预览状态与阅读位置。
- 体积较大的图表与交互依赖按需加载，构建配置位于 `vite.config.ts`。
- 设计方向见 [Web 设计指导](docs/design/web-visual-redesign.md)，数据规则见 [对话数据与展示原则](docs/design/conversation-rendering.md)，图表方向见 [Mermaid 设计指导](docs/design/mermaid-theme.md)。

## 代码规范

- 注释使用中文，日志使用英文；identifier 保持英文原名。
- Extension 开发遵循 Pi Extension 规范。
- 用户可见 UI 文本通过 `t('namespace.key')` 获取，key 按模块分组，fallback 语言为简体中文。新增文本同时更新 `src/web/src/i18n/zh-CN.ts` 和 `en.ts`。
- localStorage key 使用 `paimon:camelCase` 格式。
- `stores/` 每个独立状态域使用一个 `useXxx.ts` 文件，采用 Zustand。共享类型位于 `types.ts`，WebSocket 消息通过 `useWebSocket.subscribe(handler)` 订阅。纯转换函数放在所属 hook 内，不对外导出。
- Git 提交格式为 `type(scope): 中文描述`。提交与推送须用户明确指示。
- 发版版本号由用户指定，修改根 `package.json` 后使用 `Release version x.y.z` 提交信息。
