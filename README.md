<p align="center">
  <img src="docs/design/paimon-icon-transparent.png" width="96" />
  <br/>
  <em>守望 · 交互 · 掌控</em>
</p>

# Paimon

Pi coding agent 的远程面板——在浏览器里实时守望所有会话，随时交互介入。

## 概述

Paimon 由两部分组成：

1. **Hub Server** — 独立长驻进程，提供 Web UI，管理所有 pi 实例连接
2. **Pi Extension** — 加载到每个 pi 实例中，自动连接 Hub，转发事件、接收指令

```
┌─────────────────────────────────────────────────────┐
│  Hub Server (paimon hub start, 监听 :8080)           │
│  ├── Web UI (React + Tailwind, macOS 26 风格)        │
│  ├── 维护已连接的 pi 实例列表                         │
│  └── 路由：浏览器 ↔ 指定 pi 实例                     │
└─────────────────────────────────────────────────────┘
        ↕ WebSocket              ↕ WebSocket
┌──────────────┐         ┌──────────────┐
│ Pi 实例 A     │         │ Pi 实例 B     │
│ cwd: project1│         │ cwd: project2│
│ extension:   │         │ extension:   │
│  主动连接 Hub │         │  主动连接 Hub │
└──────────────┘         └──────────────┘
```

## 功能 (v0.1)

- Hub 启动/停止/状态查看
- Pi 实例自动注册 + 心跳探活
- 网页展示所有活跃 pi 实例列表
- 进入某实例查看实时对话流（全量 pi 事件转发）
- 刷新/重连后自动加载完整对话历史（按 turn 分页，滚动到顶部加载更多）
- 实时 streaming + 刷新后自动恢复 streaming 状态
- 自动滚动跟随新内容 + 快速滚动到底部按钮
- 发送消息（prompt / steer）
- 中止当前操作（abort）
- URL 路由保持选中状态（刷新不丢失）
- 外观设置（主题：浅色/深色/跟随系统，背景：雾/极光/余烬）
- 对话渲染模式切换（原始 / 渲染）
- 渲染模式：Markdown 全量渲染、用户气泡、思考折叠、Tool Call 卡片配对
- Tool 弹窗：按工具类型定制（read/write 代码高亮、bash 命令+输出分区、edit diff 视图、其他通用 JSON）
- API 错误展示：ErrorCard 卡片 + 超长错误弹窗详情（结构化解析 status/type/message/requestId）
- 会话信息：侧边栏上下文进度条 + 输入框上方内联展示（context usage / git branch）
- 移动端响应式布局（<768px 自动切换全屏实例列表/对话页）
- iOS Safe Area 适配（圆角屏/Home Indicator）+ 虚拟键盘弹出时自动调整视口

## 技术栈

| 层              | 选型                        |
| --------------- | --------------------------- |
| 语言            | TypeScript                  |
| 运行时 / 包管理 | Bun                         |
| Hub 后端        | Bun native HTTP + WebSocket |
| 前端框架        | React                       |
| 前端路由        | React Router                |
| 样式方案        | Tailwind CSS                |
| 前端构建        | Vite                        |
| 进程管理        | Fork daemon + PID 文件      |

## CLI

```bash
paimon hub start [--port 8080]    # 启动 Hub daemon（后台）
paimon hub stop                   # 停止 Hub
paimon hub status                 # 显示状态、已连接实例
paimon hub logs [--follow]        # 查看 Hub 日志
```

## 安装

```bash
# 全局安装
bun install -g paimon

# 或作为 pi package 安装（自动注册 extension）
pi install npm:paimon
```

## 使用

```bash
# 1. 启动 Hub
paimon hub start

# 2. 正常启动 pi（extension 自动连接 Hub）
pi

# 3. 浏览器打开
open http://localhost:8080
```

## 开发

```bash
# 安装依赖
bun install

# 一键启动（Hub + Vite build watch，同端口）
bun run dev

# 构建前端
bun run build

# 启动 Hub（生产模式）
bun run start

# 类型检查
bunx tsc --noEmit
```

## 状态文件

```
~/.paimon/
├── hub.pid          # Hub 进程 PID
├── hub.log          # Hub 日志
└── hub.port         # 当前监听端口
```

## License

MIT
