<p align="center">
  <img src="docs/design/logos/mist/light/paimon-logo.png" width="80" />
  <br/>
  <em>Watch · Interact · Control</em>
  <br/><br/>
  <a href="README.md">中文</a> | <a href="README.en.md">English</a>
</p>

Paimon lets you talk to all your [Pi](https://pi.dev/) instances from the browser.

## 📸 Screenshots

![Main Interface](docs/screenshots/main_en.png)

## ✨ Features

- 💬 **Real-time Streaming** — Streaming output, thinking process, and tool calls fully displayed
- 🧩 **Replies and Execution Summaries** — Rounded reply containers support collapsing the whole reply, with ordered tool summaries and distinct text, thinking, and tool details
- 🛠️ **Tool Execution Details** — Live top-level tool status, tool-provided partial output, errors, and execution duration, with history support
- 📊 **Mermaid Diagrams** — Automatically renders `mermaid` code blocks in Markdown, with light and dark themes, source copying, and full-screen previews
- 🖼️ **Image Support** — Paste or upload images to send to LLM, view full-size in history
- 🔄 **Multi-instance Switching** — Manage all pi sessions in one page
- 🧭 **Instance Sidebar** — One glass panel contains home, settings, connection information, and instances grouped by Edge
- ⌨️ **Resizable Composer** — Drag the top handle to resize the editor; equal-height labeled image, model, thinking, and compaction controls wrap in order, with context and send/stop on the right
- 🌐 **Multi-machine Support** — Centralized Hub + distributed Edge, manage pi instances across servers
- ➕ **Create Instances from UI** — Select Edge node + path picker
- 📋 **Session Management** — Browse session history, create or switch with one click
- 🔒 **Access Control** — Access Token protects all API and WebSocket connections
- 🎨 **Frosted Glass UI** — Clean macOS-style design
- 🌐 **Multi-language** — Chinese/English interface, switchable in settings
- 🔔 **Task Notifications** — Sends a system notification after retries, compaction recovery, and queued messages have all finished
- 📱 **Responsive Design** — Desktop/mobile adaptive, iOS Safe Area support

Replies, execution summaries, and thinking sections expand independently and retain your choices during live updates. Message timestamps are available on hover, focus, or click, with running and compaction feedback beside the current reply.

Tool details are centered on desktops and use a bottom sheet on phones, with swipe-down dismissal and independently scrolling content. Images and Mermaid diagrams support enlarged previews.

The editor grows automatically and supports resizing with its top handle. Double-click or press Home to restore automatic height, use arrow keys to adjust, and End for the maximum. Sending preserves your manual height; switching instances or sessions resets it. Drafts, IME input, image uploads, and pasting remain available. The context readout opens full usage information, and model and thinking controls use the instance's available options.

## 📋 Prerequisites

- [Pi](https://pi.dev/) >= 1.1.0
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

> 🔒 For external access, use a trusted network or a reverse proxy with TLS.

### Reverse Proxy Deployment

Example sub-path deployment with nginx:

```bash
paimon hub start --base-path /paimon
```

nginx configuration:

```nginx
location /paimon/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Access the Web UI at `https://<domain>/paimon/`.

If the proxy already provides authentication such as SSO, configure the same token in Hub and nginx for automatic login:

```bash
paimon hub start --base-path /paimon --token <access-token>
```

Add this header inside the nginx `location` block above:

```nginx
proxy_set_header Authorization "Bearer <access-token>";
```

> 🔒 Proxy authentication should protect the entire `/paimon/` path and allow access only to trusted users.

## Development

See [Web Design Guide](docs/design/web-visual-redesign.md) for the visual direction, [Conversation Data and Display Principles](docs/design/conversation-rendering.md) for data rules, and [Mermaid Design Guide](docs/design/mermaid-theme.md) for diagrams. Implementation details and visual parameters are available in the source.

Use `bunx tsc --noEmit` for code checks and select business tests based on the changes. After frontend changes, build and restart Hub before checking the result in your browser:

```bash
bun run build && paimon hub restart
```

Restart Edge when the changes require it.

## 📄 License

MIT
