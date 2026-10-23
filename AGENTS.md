# AGENTS.md

Paimon 是 Pi 的远程控制面板，采用 Web → Hub → Edge → Pi 架构。Hub 提供统一入口，每台服务器上的 Edge 管理本机 Pi 实例，Pi Extension 连接本机 Edge。

## 常用命令

```bash
bun run dev       # 构建前端并启动 Hub 与构建 watch
bun run build     # 构建前端
bun run start     # 启动 Hub
bunx tsc --noEmit  # 类型检查
bun test          # 运行业务测试

bun run scripts/build-binaries.ts          # 编译全部支持的平台
bun run scripts/build-binaries.ts --local  # 编译当前平台
bun run scripts/prepare-npm-packages.ts     # 生成 npm 发布目录
```

## 开发与验证

- 围绕当前需求修改相关代码，使用 `bunx tsc --noEmit` 检查类型。
- 保留重要业务逻辑测试，按改动范围运行相关用例；纯样式调整无需修改或运行测试。
- DOM 测试使用 `bunfig.toml` 的 happy-dom preload；Motion 功能测试使用 `MotionConfig reducedMotion="always"`，检查操作、状态、焦点与资源释放。
- 验证专用的临时目录环境变量仅作用于对应子进程。启动或重启 Hub、Edge 时清除这些设置，验证结束后清理中间文件与目录。
- 前端修改后执行 `bun run build && paimon hub restart`，Edge 按实际变更需要重启。
- 页面观感、真实浏览器交互与性能由用户检查。除非用户明确要求，Agent 不启动或使用浏览器，也不将浏览器检查列为待办或补充验证事项。

## 源码入口

- `src/protocol/types.ts`：通信协议。
- `src/cli/`、`src/hub/`、`src/edge/`：命令、中心服务与本机代理。
- `src/extensions/paimon/`：Pi Extension。
- `src/web/src/`：React 前端；业务功能位于 `features/`，公共控件位于 `components/ui/`。
- `scripts/`、`bin/paimon.cjs`：构建发布与 npm 启动器。

依赖、版本和构建配置查看 `package.json` 与 `vite.config.ts`。

## 关键约束

- Hub 通过 Edge 与 Pi 通信；Edge 创建的 Pi 进程独立于 Edge 生命周期，重连时恢复当前实例状态。
- 同一 session 文件由单个 Pi 进程写入。`paimon attach` 在本机当前工作目录选择实例，关闭目标实例后恢复其 session。
- 已完成历史与流式消息分别管理，分页使用已完成的原始条目数量。保留原始数据、未知条目与扩展字段。
- 工具通过 `toolCallId` 关联，历史结果优先；运行状态来自真实事件，信息不足时保留未知状态。时间与耗时使用已有数据。
- `agent_settled` 表示重试、压缩恢复和排队消息均已结束；任务完成通知仅响应 `completed`。
- 图片通过各层传递时保持载荷与 MIME type；子路径部署统一处理页面、API 和 WebSocket 的路径前缀。
- Hub 业务 API、Browser 和 Edge 上游连接使用 Access Token。Edge 的本机信任依赖 loopback，远程访问使用可信网络或 TLS 反向代理。
- 自更新识别真实安装来源并更新对应位置；源码更新要求工作区干净且能够 fast-forward。

## 前端原则

- 采用 macOS 26 Liquid Glass 风格，保留亮暗主题及 `mist`、`aurora`、`ember` 颜色组。玻璃材质用于导航与控制区域，正文优先保证可读性。
- 对话按用户消息组织回复，正文与系统事件分隔连续执行区域，保留正文、thinking 和工具的原始顺序。回复正文保持可见，展开选择、详情与阅读位置随用户选择保留。
- 同类控件保持一致，桌面紧凑、触摸操作范围充分；兼顾键盘、Safe Area 和 reduced motion。已有容器内的辅助按钮默认透明，主要操作、选中状态与独立悬浮按钮按需保留背景。
- 图表保留作者允许使用的局部样式；Mermaid 使用严格安全配置与 DOMPurify 清理 SVG。大型依赖按需加载，异步更新保持预览与阅读连续。

## 代码规范

- 注释使用中文，日志使用英文，identifier 保持英文原名；Extension 开发遵循 Pi Extension 规范。
- UI 文本通过 `t('namespace.key')` 获取，新增文本同步更新 `src/web/src/i18n/zh-CN.ts` 和 `en.ts`；localStorage key 使用 `paimon:camelCase`。
- 组件、私有 hook、业务工具与 type guard 按功能归属放置；跨功能工具放在 `utils/` 或 `hooks/`。共享领域类型放在所属 `types.ts`，私有类型就近定义。
- 全局状态采用 Zustand，每个状态域使用一个 `stores/useXxx.ts`；WebSocket 消息通过 `useWebSocket.subscribe(handler)` 订阅。
- 前端业务代码避免 `any` 和未经检查的类型断言；外部数据使用 `unknown` 接收，检查消费字段，优先使用依赖提供的类型。
- 样式按功能放在 `styles/`，`index.css` 保留统一导入入口；调整时检查 CSS layer、选择器优先级与规则顺序。
- 提交与推送须用户明确指示，提交格式为 `type(scope): 中文描述`。版本号由用户指定，发版使用 `Release version x.y.z` 提交信息。

## 文档维护

- README 保持简短的产品介绍与快速开始；仅在核心功能、安装或使用入口变化时同步更新中英文版本。
- `docs/` 仅在用户明确要求时修改。实现、视觉参数和具体交互从源码与测试获取，日常代码或样式调整不自动补充文档。
- `docs/design/macos-26-design-tokens.json` 与 `macos-26-figma-raw-data.md` 保留第三方原始参考数据，仅在用户明确要求更新资料本身时修改。
