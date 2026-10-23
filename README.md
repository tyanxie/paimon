<p align="center">
  <img src="docs/design/logos/mist/light/paimon-logo.png" width="80" />
  <br/>
  <em>守望 · 交互 · 掌控</em>
  <br/><br/>
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

Paimon，让你能在浏览器里跟多台服务器上的 [Pi](https://pi.dev/) 实例对话。

![主界面](docs/screenshots/main.png)

## 核心功能

- **多机与多实例管理**：统一切换实例，在页面选择服务器和工作目录创建实例。
- **实时对话**：查看流式回复、thinking、工具执行状态与结果，发送或停止任务。
- **图片与图表**：上传或粘贴图片，阅读 Markdown 和 Mermaid 图表，放大查看内容。
- **Session 与模型管理**：浏览、新建和切换 session，选择模型与思考等级，查看和压缩上下文。
- **跨设备使用**：支持桌面与移动端、亮暗主题、中文与英文，以及任务完成通知。
- **访问认证**：通过 Access Token 保护 Hub 业务接口及浏览器、Edge 到 Hub 的连接。

## 前置要求

- Pi >= 1.1.0。
- 支持 macOS 和 Linux，提供 arm64、x64 平台包。
- npm 安装需要 Node.js >= 18；源码安装需要 Bun。

## 安装

### npm（推荐）

```bash
npm install -g @tyanxie/paimon
pi install npm:@tyanxie/paimon
```

### 从源码安装

```bash
git clone https://github.com/tyanxie/paimon.git
cd paimon
bun install
bun run build
bun link
pi install .
```

## 快速开始

在同一台机器启动 Hub、Edge，再在工作目录启动 Pi：

```bash
paimon hub start
paimon edge start
pi
```

在浏览器访问 `http://localhost:8080`，首次登录输入 Hub 启动时输出的 Access Token。

Hub 提供 Web 页面，Edge 管理所在机器的实例，Pi Extension 自动连接本机 Edge。每台运行 Pi 的机器都需要安装 Extension 并启动 Edge。

多机、子路径与反向代理配置见 [部署指南](docs/deployment.md)。远程访问请使用可信网络或 TLS 反向代理。

## 开发

开发命令与协作规则见 [AGENTS.md](AGENTS.md)，具体实现与交互查看源码和测试。

## License

MIT
