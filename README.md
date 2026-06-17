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
- 🌐 **多机支持** — 中心化 Hub + 分布式 Edge，管理多台服务器上的 pi 实例
- ➕ **页面创建实例** — 选择 Edge 节点 + 路径选择器
- 📋 **Session 管理** — 浏览历史 session，一键新建或切换
- 🔒 **访问认证** — Access Token 保护所有 API 和 WebSocket 连接
- 🎨 **毛玻璃风格界面** — 清爽的 macOS 风格设计
- 📱 **响应式设计** — 桌面/移动端自适应，iOS Safe Area 适配

## 🏗️ 架构

```
Browser ◄─WS─► Hub (:8080) ◄─WS─► Edge A (:8033) ◄─WS─► Pi 1..N
                            ◄─WS─► Edge B (:8033) ◄─WS─► Pi 1..M
```

- **Hub** — 中心服务，接 Browser 和 Edge，路由消息，服务 Web UI
- **Edge** — 边缘代理，每台服务器一个，管理本机 pi 实例，聚合上报 Hub
- **Pi Extension** — pi 插件，连接本机 Edge，转发事件和指令

## 📋 前置要求

- [Pi](https://pi.dev/) >= 0.78.1

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

# 启动 Edge（同一机器）
paimon edge start

# 启动 pi
pi

# 打开浏览器（首次需输入启动时输出的 Access Token）
open http://localhost:8080
```

> ⚠️ `bun link` 通过软链接指向当前 clone 目录，**安装后请勿删除、移动或重命名该目录**，否则 `paimon` 命令会失效。

### 多机部署

```bash
# 机器 A（Hub 所在机器）
paimon hub start --host 0.0.0.0
paimon edge start --hub ws://localhost:8080

# 机器 B（远程服务器，需指定 Hub 的 token）
paimon edge start --hub ws://<hub-ip>:8080 --token <access-token>
```

## 🛠️ paimon CLI

| 命令                                                                                                     | 说明               |
| -------------------------------------------------------------------------------------------------------- | ------------------ |
| `paimon hub start [--port 8080] [--host 127.0.0.1] [--token <token>]`                                    | 启动 Hub daemon    |
| `paimon hub stop`                                                                                        | 停止 Hub           |
| `paimon hub restart [--token <token>]`                                                                   | 重启 Hub           |
| `paimon hub status`                                                                                      | 查看运行状态       |
| `paimon hub logs [--follow]`                                                                             | 查看日志           |
| `paimon edge start [--port 8033] [--host 127.0.0.1] [--hub ws://...] [--edge-id <id>] [--token <token>]` | 启动 Edge daemon   |
| `paimon edge stop`                                                                                       | 停止 Edge          |
| `paimon edge restart [--token <token>]`                                                                  | 重启 Edge          |
| `paimon edge status`                                                                                     | 查看运行状态       |
| `paimon edge logs [--follow]`                                                                            | 查看日志           |
| `paimon attach [id]`                                                                                     | 接管实例到当前终端 |

> 🔒 即使有 Access Token 保护，`--host 0.0.0.0` 仍建议仅在可信网络使用——当前不支持 TLS，token 明文传输可能被网络嗅探。

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
bun src/cli/index.ts edge start
```

## 📄 License

MIT
