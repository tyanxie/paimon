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

## 📋 前置要求

- [Pi](https://pi.dev/) >= 0.78.1
- Node.js >= 18（npm 安装方式）或 [Bun](https://bun.sh/)（从源码安装）

## 🚀 快速开始

Paimon 采用三层架构：

- **Hub** — 中心服务，服务 Web UI，接收 Edge 上报
- **Edge** — 每台机器上的代理，管理本机 pi 实例
- **Extension** — pi 插件，自动连接本机 Edge

### 安装

**npm 安装（推荐）**

```bash
npm install -g @tyanxie/paimon    # 安装 paimon CLI
pi install npm:@tyanxie/paimon   # 安装 pi 插件
```

**从源码安装**

```bash
git clone https://github.com/tyanxie/paimon.git && cd paimon
bun install       # 安装依赖
bun run build     # 构建前端
bun link          # 安装 paimon CLI
pi install .      # 安装 pi 插件
```

### 使用

```bash
# 启动 Hub
paimon hub start

# 启动 Edge
paimon edge start

# 启动 pi（任意目录）
pi

# 打开浏览器（首次需输入启动时输出的 Access Token）
open http://localhost:8080
```

### 多机部署

```bash
# 机器 A（Hub 所在机器）
paimon hub start --host 0.0.0.0
paimon edge start --hub ws://localhost:8080

# 机器 B（远程服务器，需指定 Hub 的 token）
paimon edge start --hub ws://<hub-ip>:8080 --token <access-token>
```

> 🔒 `--host 0.0.0.0` 会暴露服务到公网。当前不支持 TLS，token 明文传输可被网络嗅探，建议仅在可信网络使用或通过反向代理（nginx/caddy）提供 TLS。

## 📄 License

MIT
