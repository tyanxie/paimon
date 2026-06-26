<p align="center">
  <img src="docs/design/logos/mist/light/paimon-logo.png" width="80" />
  <br/>
  <em>Watch · Interact · Control</em>
  <br/><br/>
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

Paimon lets you talk to all your [Pi](https://pi.dev/) instances from the browser.

## 📸 Screenshots

![Main Interface](docs/screenshots/main.png)

## ✨ Features

- 💬 **Real-time Streaming** — Streaming output, thinking process, and tool calls fully displayed
- 🖼️ **Image Support** — Paste or upload images to send to LLM, view full-size in history
- 🔄 **Multi-instance Switching** — Manage all pi sessions in one page
- 🌐 **Multi-machine Support** — Centralized Hub + distributed Edge, manage pi instances across servers
- ➕ **Create Instances from UI** — Select Edge node + path picker
- 📋 **Session Management** — Browse session history, create or switch with one click
- 🔒 **Access Control** — Access Token protects all API and WebSocket connections
- 🎨 **Frosted Glass UI** — Clean macOS-style design
- 🌐 **Multi-language** — Chinese/English interface, switchable in settings
- 📱 **Responsive Design** — Desktop/mobile adaptive, iOS Safe Area support

## 📋 Prerequisites

- [Pi](https://pi.dev/) >= 0.78.1
- Node.js >= 18 (for npm install) or [Bun](https://bun.sh/) (for source install)

## 🚀 Quick Start

Paimon uses a three-layer architecture:

- **Hub** — Central server, serves Web UI, receives Edge reports
- **Edge** — Agent on each machine, manages local pi instances
- **Extension** — Pi plugin, automatically connects to local Edge

### Installation

**npm (recommended)**

```bash
npm install -g @tyanxie/paimon    # Install paimon CLI
pi install npm:@tyanxie/paimon   # Install pi extension
```

**From source**

```bash
git clone https://github.com/tyanxie/paimon.git && cd paimon
bun install       # Install dependencies
bun run build     # Build frontend
bun link          # Install paimon CLI
pi install .      # Install pi extension
```

### Usage

```bash
# Start Hub
paimon hub start

# Start Edge
paimon edge start

# Start pi (any directory)
pi

# Open browser (enter Access Token printed at startup on first visit)
open http://localhost:8080
```

### Multi-machine Deployment

```bash
# Machine A (where Hub runs)
paimon hub start --host 0.0.0.0
paimon edge start --hub ws://localhost:8080

# Machine B (remote server, specify Hub's token)
paimon edge start --hub ws://<hub-ip>:8080 --token <access-token>
```

> 🔒 `--host 0.0.0.0` exposes the service publicly. TLS is not currently supported — tokens are transmitted in plaintext and can be sniffed. Use only on trusted networks or behind a reverse proxy (nginx/caddy) with TLS.

## 📄 License

MIT
