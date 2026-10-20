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
- ⌨️ **Adaptive Input Toolbar** — Images, models, thinking, and context in one toolbar; narrower areas move secondary options into a menu while keeping send/stop visible
- 🌐 **Multi-machine Support** — Centralized Hub + distributed Edge, manage pi instances across servers
- ➕ **Create Instances from UI** — Select Edge node + path picker
- 📋 **Session Management** — Browse session history, create or switch with one click
- 🔒 **Access Control** — Access Token protects all API and WebSocket connections
- 🎨 **Frosted Glass UI** — Clean macOS-style design
- 🌐 **Multi-language** — Chinese/English interface, switchable in settings
- 🔔 **Task Notifications** — Sends a system notification after retries, compaction recovery, and queued messages have all finished
- 📱 **Responsive Design** — Desktop/mobile adaptive, iOS Safe Area support

After a refresh or reconnection during tool execution, subsequent update or end events resume the live display. Final results are also available through history. Running tools show call elapsed time measured with a monotonic clock; completed tools show the execution duration reported by Pi. The card's right side and detail header share one elapsed-time value and the same duration display, using `s` and `ms` with a non-breaking space between the number and unit. Bash details show the supplied timeout in the command area.

Reply, execution summary, and thinking sections retain your chosen expanded state and reset when switching instances or sessions. Collapse transitions use Motion and respect reduced-motion preferences. Message timestamps are available on hover, focus, or click. Running and compaction feedback appears beside the reply.

Tool details are centered on desktops and wide tablets, and use a nearly full-screen bottom sheet on phones. Swipe down from the top drag area to dismiss; the header stays visible while the content scrolls independently. The backdrop and panel animate independently. Focus returns to the opener after the exit animation. Image and Mermaid previews retain their size mode and reading position.

A continuous, translucent header spans the conversation area, containing instance information and session actions. Conversation content retains its own reading width.

Forms, menus, settings, and content actions share controls with consistent focus, disabled, loading, and selected states. Theme, background, language, and notification settings share compact segmented controls. Desktop buttons, fields, and lists use compact sizes and spacing; touch devices retain hit regions of at least 44px. Image removal and message timestamps use 24px visible controls with separate touch regions. Instance creation and compaction keep their action footer visible; menus adapt their position and scrolling to the visual viewport, and settings rows adapt to the available content width. Notices support long messages and reduced motion, using the native Popover API when available to appear while a detail dialog is open.

The composer preserves drafts, IME input, image uploads, and pasting. Open the context readout to inspect full usage; missing token counts after compaction show an awaiting-update state. Model and thinking controls use the instance's available options.

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

See [Conversation Data and Display Model](docs/design/conversation-rendering.md) for data and pagination rules, [Web Visual Redesign](docs/design/web-visual-redesign.md) for implementation scope, and [Web Validation](docs/design/web-validation.md) for automated coverage and the browser checklist.

After completing local changes, tests, and documentation, build and restart the services before checking the result in your browser:

```bash
bun run build && paimon hub restart && paimon edge restart
```

## 📄 License

MIT
