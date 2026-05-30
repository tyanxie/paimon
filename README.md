<p align="center">
  <img src="docs/design/logos/mist/light/paimon-logo.png" width="80" />
  <br/>
  <em>守望 · 交互 · 掌控</em>
</p>

Paimon，让你能在浏览器里跟所有 [Pi](https://pi.dev/) 实例对话。

## 📸 截图

![主界面](docs/screenshots/main.png)

## ✨ 特性

- 💬 **实时对话流** — 流式输出、思考过程、工具调用全展示
- 🔄 **多实例切换** — 一个页面管理所有 pi 会话
- 📋 **Session 管理** — 浏览历史 session，一键新建或切换
- 🎨 **毛玻璃风格界面** — 清爽的 macOS 风格设计
- 📱 **响应式设计** — 桌面/移动端自适应，iOS Safe Area 适配

## 🚀 快速开始

```bash
# 克隆并安装依赖
git clone https://github.com/tyanxie/paimon.git && cd paimon
bun install

# 构建前端（Hub 启动依赖 dist/web/）
bun run build

# 安装 paimon CLI 到全局（软链接回当前目录）
bun link

# 安装 extension（让 pi 启动时自动加载）
pi install .

# 启动 Hub
paimon hub start

# 启动 pi
pi

# 打开浏览器
open http://localhost:8080
```

> ⚠️ `bun link` 通过软链接指向当前 clone 目录，**安装后请勿删除、移动或重命名该目录**，否则 `paimon` 命令会失效。

## 🛠️ paimon CLI

```bash
paimon hub start [--port 8080]   # 启动 Hub daemon
paimon hub stop                  # 停止 Hub
paimon hub status                # 查看 Hub 状态
paimon hub logs [--follow]       # 查看 Hub 日志
```

运行时状态（PID / 端口 / 日志）存储在 `~/.paimon/`。

## 🧹 卸载

```bash
# 在 clone 目录执行，解除全局链接
bun unlink

# 清理运行时状态
rm -rf ~/.paimon
```

## 💻 开发

```bash
# 开发模式：构建前端 + 启动 Hub + watch
bun run dev

# 直接运行 CLI 源码（无需 bun link）
bun src/cli/index.ts hub start
```

## 📄 License

MIT
