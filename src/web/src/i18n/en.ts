// 英文语言包

import type { LocaleResource } from "./zh-CN";

const en: LocaleResource = {
  // ─── Common ───
  common: {
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    loading: "Loading…",
    online: "Online",
    offline: "Offline",
  },

  modal: {
    content: "Dialog content",
  },

  imagePreview: {
    title: "Image preview",
    close: "Close preview",
    actualSize: "Actual size",
    fitWindow: "Fit to window",
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
    machine_one: "{{count}} machine",
    machine_other: "{{count}} machines",
    instance_one: "{{count}} instance",
    instance_other: "{{count}} instances",
    noInstances: "No pi instances connected",
    settings: "Settings",
    shutdown: "Shutdown instance",
    shutdownBusy: "Instance is running, please wait before shutting down",
    statusStreaming: "Running",
    statusCompacting: "Compacting",
    statusIdle: "Idle",
    statusPending: "Waiting for status",
  },

  navigation: {
    brand: "Paimon",
    main: "Main navigation",
    home: "Home",
    instances: "Instances",
    connection: "Connection status",
    backToInstances: "Back to instances",
    copyEdge: "Copy Edge: {{edgeId}}",
    instanceActions: "Actions for {{name}}",
  },

  composer: {
    options: "Input options",
    images: "Images",
    modelWaiting: "Awaiting model",
    thinkingLabel: "Thinking",
    pendingThinking: "Awaiting update",
    unsupportedThinking: "Unsupported",
    compact: "Compact",
    compactBusy: "Compaction is unavailable while a task is running",
    compactUnavailable:
      "Compaction will be available after context usage updates",
    resizeHeight: "Resize input area",
    resizeHeightHelp:
      "Drag to resize; double-click or press Home for automatic height; use arrow keys to resize and End for maximum height",
    heightPixels: "{{height}} pixels",
    model: "Select model",
    thinkingLevel: "Thinking level",
    contextUsage: "Context usage",
    usedTokens: "Used tokens",
    contextWindow: "Context window",
    pendingUsage: "Awaiting update",
    pendingUsageDescription:
      "Context usage will update after the next response",
    previewImage: "Preview attached image {{count}}",
    removeImage: "Remove attached image {{count}}",
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
    compactContext: "Compact context",
    instanceNotFound: "Instance not found",
  },

  conversation: {
    agentName: "Pi",
    you: "Your message",
    approximateDuration: "Approx. {{duration}}",
    durationMilliseconds: "{{value}} ms",
    durationSeconds: "{{value}} s",
    durationMinutes: "{{value}} min",
    durationHours: "{{value}} h",
    durationDays: "{{value}} d",
    compactingContext: "Compacting context",
    attachedImage: "Attached image {{count}}",
    expandExecution: "Expand tools and thinking",
    collapseExecution: "Collapse tools and thinking",
    toolDetails: "View {{name}} tool details",
    moreToolTypes_one: "{{count}} more tool type",
    moreToolTypes_other: "{{count}} more tool types",
    thinkingCount_one: "{{count}} thinking section",
    thinkingCount_other: "{{count}} thinking sections",
    thinkingStreamingCount_one:
      "{{count}} thinking section, thinking in progress",
    thinkingStreamingCount_other:
      "{{count}} thinking sections, thinking in progress",
    toolsPending_one: "{{count}} tool preparing",
    toolsPending_other: "{{count}} tools preparing",
    toolsRunning_one: "{{count}} tool running",
    toolsRunning_other: "{{count}} tools running",
    toolsCompleted_one: "{{count}} tool completed",
    toolsCompleted_other: "{{count}} tools completed",
    toolsFailed_one: "{{count}} tool failed",
    toolsFailed_other: "{{count}} tools failed",
    toolsAborted_one: "{{count}} tool aborted",
    toolsAborted_other: "{{count}} tools aborted",
    toolsUnknown_one: "{{count}} tool result unavailable",
    toolsUnknown_other: "{{count}} tool results unavailable",
    toolPending: "Preparing",
    toolCompleted: "Completed",
    toolFailed: "Failed",
    toolUnknown: "Result unavailable",
    toolUnavailableDescription:
      "No tool result or execution record was received.",
    replyFailed: "Reply failed",
    replyStart: "Started",
    replyEnd: "Last updated",
    loadingEarlier: "Loading earlier messages…",
    loadingConversation: "Loading conversation",
    loadFailed: "Failed to load conversation",
    noMessages: "No messages yet",
    instanceInfo: "Instance info",
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

  // ─── Notification ───
  notification: {
    title: "Notification",
    label: "Task Completion Notification",
    on: "On",
    off: "Off",
    denied: "Notification permission denied. Please allow in browser settings",
    taskComplete: "✅ {{name}} task completed",
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
    code: "Code",
    contextCompacted: "Context compacted",
    branchSummary: "Branch summary",
    thinking: "Thinking",
    thinkingStreaming: "Thinking...",
    running: "Running...",
    aborted: "Aborted",
    copied: "Copied",
    copy: "Copy",
    mermaidDiagram: "Mermaid diagram",
    mermaidExpand: "Enlarge",
    mermaidLoading: "Rendering diagram…",
    mermaidError: "Unable to render diagram. Source shown below.",
    result: "Result",
    output: "Output",
    executionDuration: "Execution duration",
    waitingDuration: "Call elapsed time",
    timeout: "Timeout",
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
    action: {
      compact: "Compaction failed: {{message}}",
    },
  },
} as const;

export default en;
