// 英文语言包

import type { LocaleResource } from "./zh-CN";

const en: LocaleResource = {
  // ─── Common ───
  common: {
    cancel: "Cancel",
    confirm: "Confirm",
    loading: "Loading…",
    online: "Online",
    offline: "Offline",
  },

  // ─── Login ───
  login: {
    subtitle: "Enter access token to connect",
    placeholder: "Access Token",
    invalidToken: "Invalid token. Please check and try again.",
    connect: "Connect",
    verifying: "Verifying…",
    tokenHint: "Find your token in <1>~/.paimon/hub.json</1>",
  },

  // ─── Sidebar ───
  sidebar: {
    newInstance: "New instance",
    instanceCount_one: "{{count}} instance",
    instanceCount_other: "{{count}} instances",
    noInstances: "No pi instances connected",
    settings: "Settings",
    shutdown: "Shutdown instance",
    statusStreaming: "Streaming",
    statusCompacting: "Compacting",
    statusIdle: "Idle",
  },

  // ─── Event Stream / Conversation ───
  eventStream: {
    tagline: "Watch · Interact · Control",
    sendPlaceholder: "Send a message...",
    scrollToBottom: "Scroll to bottom",
    stop: "Stop",
    send: "Send",
    attachImage: "Attach image",
    imageProcessFailed: "Image processing failed, please check the format",
    statusRunning: "Running",
    statusCompacting: "Compacting",
    statusOnline: "Online",
    compactContext: "Compact context",
    instanceNotFound: "Instance not found",
  },

  // ─── Compact Modal ───
  compact: {
    title: "Compact Context",
    description:
      "Compaction summarizes older conversation to free up context space. Optionally provide custom instructions to guide what to focus on.",
    placeholder: "e.g. Keep the discussion about database design…",
    start: "Start compaction",
  },

  // ─── Settings ───
  settings: {
    title: "Settings",
    appearance: "Appearance",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    background: "Background",
    bgMist: "Mist",
    bgAurora: "Aurora",
    bgEmber: "Ember",
    language: "Language",
    langZhCN: "简体中文",
    langEn: "English",
  },

  // ─── New Instance Modal ───
  newInstance: {
    title: "New Instance",
    edgeNode: "Edge Node",
    noEdges: "No available Edge nodes",
    workingDir: "Working Directory",
    pathPlaceholder: "/path/to/your/project",
    create: "Create",
    creating: "Creating…",
    truncatedHint: "Type more to narrow results…",
    fetchEdgeError: "Failed to fetch edge list",
    noEdgeSelected: "No edge selected",
    requestTimeout: "Request timed out",
    networkError: "Network error",
    requestFailed: "Request failed (HTTP {{status}})",
  },

  // ─── Session Panel ───
  session: {
    title: "Sessions",
    new: "New",
    filter: "Filter…",
    noMatch: "No matching sessions",
    noPrevious: "No previous sessions",
    empty: "Empty session",
    messageCount_one: "{{count}} message",
    messageCount_other: "{{count}} messages",
    timeJustNow: "just now",
  },

  // ─── Message Entries ───
  entries: {
    contextCompacted: "Context compacted",
    branchSummary: "Branch summary",
    thinking: "Thinking",
    thinkingStreaming: "Thinking...",
    running: "Running...",
    aborted: "Aborted",
    copied: "Copied",
    copy: "Copy",
    result: "Result",
    params: "Parameters",
  },

  // ─── Re-edit ───
  reEdit: {
    button: "Edit",
    draftNotEmpty: "Input is not empty, please clear first",
  },

  // ─── Error Card ───
  error: {
    title: "Error Details",
    message: "Error message",
    type: "Error type",
    requestId: "Request ID",
  },
} as const;

export default en;
