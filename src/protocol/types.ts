// Paimon 通信协议类型定义
// Extension ↔ Hub ↔ Browser 所有消息结构

// ============================================================
// 基础类型
// ============================================================

/** pi 实例唯一标识（Hub 分配） */
export type InstanceId = string;

/** 消息中附带的图片载荷（base64 编码，四层透传：Browser → Hub → Edge → Extension） */
export interface ImagePayload {
  /** base64 编码的图片数据 */
  data: string;
  /** MIME 类型，如 "image/png", "image/jpeg" */
  mimeType: string;
}

/** 思考等级（与 pi 内部 ModelThinkingLevel 一致） */
export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/** 模型信息 */
export interface ModelInfo {
  provider: string;
  id: string;
  name?: string;
}

/** 上下文使用信息 */
export interface ContextUsageInfo {
  /** 当前 token 数（压缩后首次响应前为 null） */
  tokens: number | null;
  /** 模型上下文窗口大小 */
  contextWindow: number;
  /** 使用率百分比（0-100，tokens 为 null 时为 null） */
  percent: number | null;
}

/** 实例状态 */
export type InstanceStatus = "idle" | "streaming" | "compacting";

/** pi 实例信息 */
export interface InstanceInfo {
  id: InstanceId;
  /** 所属 Edge 标识 */
  edgeId: string;
  /** 主机名 */
  hostname: string;
  /** 工作目录 */
  cwd: string;
  /** 所在机器的 home 目录（用于前端 ~ 缩写） */
  homedir: string;
  /** 模型信息 */
  model: ModelInfo;
  /** 当前 session ID（来自 pi sessionManager） */
  sessionId?: string;
  /** 当前 session 名 */
  sessionName?: string;
  /** pi 进程 PID */
  pid: number;
  /** 实例状态 */
  status: InstanceStatus;
  /** 上下文使用情况 */
  contextUsage?: ContextUsageInfo;
  /** Git 分支名（null = 非 git 仓库, "detached" = detached HEAD） */
  gitBranch?: string | null;
  /** 可用模型列表 */
  availableModels?: ModelInfo[];
  /** 当前思考等级（模型不支持 reasoning 时不存在） */
  thinkingLevel?: ThinkingLevel;
  /** 注册时间 */
  connectedAt: number;
  /** 最后心跳时间 */
  lastHeartbeat: number;
}

// ============================================================
// Session 列表相关
// ============================================================

/** Session 列表项 */
export interface SessionListItem {
  /** session 文件路径 */
  path: string;
  /** session UUID */
  id: string;
  /** 用户自定义名称 */
  name?: string;
  /** 工作目录 */
  cwd: string;
  /** 创建时间（ISO） */
  created: string;
  /** 最后修改时间（ISO） */
  modified: string;
  /** 消息数量 */
  messageCount: number;
  /** 第一条消息预览（截断） */
  firstMessage: string;
  /** 是否为当前活跃 session */
  isCurrent: boolean;
}

// ============================================================
// Extension ↔ Edge 消息（Extension 连接本机 Edge）
// ============================================================

export type ExtensionToEdgeMessage =
  | ExtRegisterMessage
  | PingMessage
  | ExtEventMessage
  | ExtStateMessage
  | ExtHistoryMessage
  | ExtSessionListMessage
  | ExtQuitMessage;

/** 主动退出通知（跳过 grace period） */
export interface ExtQuitMessage {
  type: "quit";
}

/** 注册 */
export interface ExtRegisterMessage {
  type: "register";
  payload: {
    /** 主机名 */
    hostname: string;
    cwd: string;
    model: ModelInfo;
    /** 当前 session ID（来自 pi sessionManager） */
    sessionId?: string;
    sessionName?: string;
    pid: number;
    /** 可用模型列表 */
    availableModels?: ModelInfo[];
    /** 上下文用量 */
    contextUsage?: ContextUsageInfo;
    /** Git 分支 */
    gitBranch?: string;
    /** 当前思考等级（模型支持 reasoning 时） */
    thinkingLevel?: ThinkingLevel;
    /**
     * Edge spawn 实例时注入的一次性 token（来自 PAIMON_SPAWN_TOKEN 环境变量）。
     * 仅由页面创建的实例携带，用于 Edge 将 spawn 请求与注册成功的实例对应起来。
     */
    spawnToken?: string;
  };
}

/** 心跳探测（Extension / Browser 共用） */
export interface PingMessage {
  type: "ping";
}

/** 转发 pi 事件 */
export interface ExtEventMessage {
  type: "event";
  payload: {
    /** pi 事件名 */
    event: string;
    /** 事件数据 */
    data: unknown;
    /** 事件时间戳 */
    timestamp: number;
  };
}

/** 状态变更 */
export interface ExtStateMessage {
  type: "state";
  payload: {
    status?: InstanceStatus;
    /** 上下文使用情况 */
    contextUsage?: ContextUsageInfo;
    /** Git 分支名 */
    gitBranch?: string | null;
    /** 模型变更 */
    model?: ModelInfo;
    /** 思考等级变更（null = 清除，模型不支持 reasoning 时） */
    thinkingLevel?: ThinkingLevel | null;
  };
}

/** 历史消息响应 */
export interface ExtHistoryMessage {
  type: "history";
  payload: {
    /** session branch entries（分页后的） */
    entries: unknown[];
    /** 是否还有更早的历史 */
    hasMore: boolean;
  };
}

/** Session 列表响应 */
export interface ExtSessionListMessage {
  type: "session_list";
  payload: {
    sessions: SessionListItem[];
    /** 过滤后的总数 */
    total: number;
    /** 是否还有更多 */
    hasMore: boolean;
  };
}

// ============================================================
// Edge → Extension 消息
// ============================================================

export type EdgeToExtensionMessage =
  | HubRegisteredMessage
  | HubPromptMessage
  | HubSteerMessage
  | HubAbortMessage
  | HubSetModelMessage
  | HubSetThinkingLevelMessage
  | HubCompactMessage
  | HubShutdownMessage
  | PongMessage
  | HubGetHistoryMessage
  | HubListSessionsMessage
  | HubNewSessionMessage
  | HubSwitchSessionMessage;

/** 指示实例优雅退出 */
export interface HubShutdownMessage {
  type: "shutdown";
}

/** 注册确认，返回分配的 id */
export interface HubRegisteredMessage {
  type: "registered";
  payload: {
    id: InstanceId;
  };
}

/** 发送用户消息 */
export interface HubPromptMessage {
  type: "prompt";
  payload: {
    message: string;
    /** 附带的图片列表（base64） */
    images?: ImagePayload[];
  };
}

/** 发送 steer 消息 */
export interface HubSteerMessage {
  type: "steer";
  payload: {
    message: string;
  };
}

/** 中止当前操作 */
export interface HubAbortMessage {
  type: "abort";
}

/** 切换模型 */
export interface HubSetModelMessage {
  type: "set_model";
  payload: {
    provider: string;
    id: string;
  };
}

/** 切换思考等级 */
export interface HubSetThinkingLevelMessage {
  type: "set_thinking_level";
  payload: {
    level: ThinkingLevel;
  };
}

/** 触发上下文压缩 */
export interface HubCompactMessage {
  type: "compact";
  payload?: {
    customInstructions?: string;
  };
}

/** 心跳回复（Hub 回复 Extension / Browser 共用） */
export interface PongMessage {
  type: "pong";
}

/** 请求历史消息 */
export interface HubGetHistoryMessage {
  type: "get_history";
  payload?: {
    /** 从末尾跳过的条目数 */
    offset?: number;
    /** 本次请求的最大条目数（按 turn 对齐） */
    limit?: number;
  };
}

/** 请求 session 列表 */
export interface HubListSessionsMessage {
  type: "list_sessions";
  payload?: {
    /** 跳过的条目数（默认 0） */
    offset?: number;
    /** 单页大小（默认 20） */
    limit?: number;
    /** 搜索关键字（匹配 name/firstMessage） */
    filter?: string;
  };
}

/** 创建新 session */
export interface HubNewSessionMessage {
  type: "new_session";
}

/** 切换 session */
export interface HubSwitchSessionMessage {
  type: "switch_session";
  payload: {
    path: string;
  };
}

// ============================================================
// Browser → Hub 消息
// ============================================================

export type BrowserToHubMessage =
  | PingMessage
  | BrowserSubscribeMessage
  | BrowserUnsubscribeMessage
  | BrowserPromptMessage
  | BrowserSteerMessage
  | BrowserAbortMessage
  | BrowserSetModelMessage
  | BrowserSetThinkingLevelMessage
  | BrowserCompactMessage
  | BrowserShutdownMessage
  | BrowserListMessage
  | BrowserHistoryMessage
  | BrowserListSessionsMessage
  | BrowserNewSessionMessage
  | BrowserSwitchSessionMessage;

/** 请求实例优雅退出（Browser → Hub） */
export interface BrowserShutdownMessage {
  type: "shutdown";
  payload: {
    instanceId: InstanceId;
  };
}

/** 订阅实例事件流 */
export interface BrowserSubscribeMessage {
  type: "subscribe";
  payload: {
    instanceId: InstanceId;
  };
}

/** 取消订阅 */
export interface BrowserUnsubscribeMessage {
  type: "unsubscribe";
  payload: {
    instanceId: InstanceId;
  };
}

/** 向实例发送消息 */
export interface BrowserPromptMessage {
  type: "prompt";
  payload: {
    instanceId: InstanceId;
    message: string;
    /** 附带的图片列表（base64） */
    images?: ImagePayload[];
  };
}

/** 向实例发送 steer */
export interface BrowserSteerMessage {
  type: "steer";
  payload: {
    instanceId: InstanceId;
    message: string;
  };
}

/** 中止实例操作 */
export interface BrowserAbortMessage {
  type: "abort";
  payload: {
    instanceId: InstanceId;
  };
}

/** 切换实例模型 */
export interface BrowserSetModelMessage {
  type: "set_model";
  payload: {
    instanceId: InstanceId;
    provider: string;
    id: string;
  };
}

/** 切换实例思考等级 */
export interface BrowserSetThinkingLevelMessage {
  type: "set_thinking_level";
  payload: {
    instanceId: InstanceId;
    level: ThinkingLevel;
  };
}

/** 触发实例上下文压缩 */
export interface BrowserCompactMessage {
  type: "compact";
  payload: {
    instanceId: InstanceId;
    customInstructions?: string;
  };
}

/** 请求实例列表 */
export interface BrowserListMessage {
  type: "list";
}

/** 请求实例历史消息 */
export interface BrowserHistoryMessage {
  type: "get_history";
  payload: {
    instanceId: InstanceId;
    /** 从末尾跳过的条目数 */
    offset?: number;
    /** 本次请求的最大条目数（按 turn 对齐） */
    limit?: number;
  };
}

/** 请求实例的 session 列表 */
export interface BrowserListSessionsMessage {
  type: "list_sessions";
  payload: {
    instanceId: InstanceId;
    /** 跳过的条目数（默认 0） */
    offset?: number;
    /** 单页大小（默认 20） */
    limit?: number;
    /** 搜索关键字（匹配 name/firstMessage） */
    filter?: string;
  };
}

/** 指示实例创建新 session */
export interface BrowserNewSessionMessage {
  type: "new_session";
  payload: {
    instanceId: InstanceId;
  };
}

/** 指示实例切换 session */
export interface BrowserSwitchSessionMessage {
  type: "switch_session";
  payload: {
    instanceId: InstanceId;
    path: string;
  };
}

// ============================================================
// Hub → Browser 消息
// ============================================================

export type HubToBrowserMessage =
  | PongMessage
  | HubInstanceListMessage
  | HubInstanceUpdateMessage
  | HubForwardedEventMessage
  | HubHistoryMessage
  | HubSessionListMessage
  | HubErrorMessage;

/** 实例列表 */
export interface HubInstanceListMessage {
  type: "instance_list";
  payload: {
    instances: InstanceInfo[];
  };
}

/** 单个实例状态更新 */
export interface HubInstanceUpdateMessage {
  type: "instance_update";
  payload: {
    instance: InstanceInfo;
    /** 更新类型 */
    action: "connected" | "disconnected" | "updated";
  };
}

/** 转发的 pi 事件 */
export interface HubForwardedEventMessage {
  type: "forwarded_event";
  payload: {
    instanceId: InstanceId;
    event: string;
    data: unknown;
    timestamp: number;
  };
}

/** 历史消息 */
export interface HubHistoryMessage {
  type: "history";
  payload: {
    instanceId: InstanceId;
    /** session branch 数据（分页后的） */
    messages: unknown[];
    /** 是否还有更早的历史 */
    hasMore: boolean;
  };
}

/** Session 列表（响应 list_sessions） */
export interface HubSessionListMessage {
  type: "session_list";
  payload: {
    instanceId: InstanceId;
    sessions: SessionListItem[];
    /** 过滤后的总数 */
    total: number;
    /** 是否还有更多 */
    hasMore: boolean;
  };
}

/** 错误 */
export interface HubErrorMessage {
  type: "error";
  payload: {
    message: string;
    code?: string;
  };
}

// ============================================================
// Hub 状态文件结构
// ============================================================

/** Hub daemon 运行时状态（存储于 ~/.paimon/hub.json） */
export interface HubState {
  pid: number;
  port: number;
  host: string;
  startedAt: string; // ISO 8601
  /** Hub 访问令牌（Edge / Browser / API 连接时校验） */
  accessToken: string;
}

// ============================================================
// Edge → Hub 消息
// ============================================================

export type EdgeToHubMessage =
  | EdgeRegisterMessage
  | PingMessage
  | EdgeInstanceRegisterMessage
  | EdgeInstanceEventMessage
  | EdgeInstanceStateMessage
  | EdgeInstanceHistoryMessage
  | EdgeInstanceSessionListMessage
  | EdgeInstanceQuitMessage
  | EdgeSpawnResultMessage
  | EdgeBrowseResultMessage;

/** Edge 自身注册 */
export interface EdgeRegisterMessage {
  type: "edge_register";
  payload: {
    edgeId: string;
    hostname: string;
    /** Edge 所在机器的 home 目录 */
    homedir: string;
  };
}

/** 转发：pi 实例注册（多路复用，带 instanceId） */
export interface EdgeInstanceRegisterMessage {
  type: "instance_register";
  payload: {
    instanceId: InstanceId;
    hostname: string;
    cwd: string;
    model: ModelInfo;
    sessionId?: string;
    sessionName?: string;
    pid: number;
    availableModels?: ModelInfo[];
    contextUsage?: ContextUsageInfo;
    gitBranch?: string;
    thinkingLevel?: ThinkingLevel;
  };
}

/** 转发：pi 事件 */
export interface EdgeInstanceEventMessage {
  type: "instance_event";
  payload: {
    instanceId: InstanceId;
    event: string;
    data: unknown;
    timestamp: number;
  };
}

/** 转发：pi 状态变更 */
export interface EdgeInstanceStateMessage {
  type: "instance_state";
  payload: {
    instanceId: InstanceId;
    status?: InstanceStatus;
    contextUsage?: ContextUsageInfo;
    gitBranch?: string | null;
    model?: ModelInfo;
    thinkingLevel?: ThinkingLevel | null;
  };
}

/** 转发：pi 历史响应 */
export interface EdgeInstanceHistoryMessage {
  type: "instance_history";
  payload: {
    instanceId: InstanceId;
    entries: unknown[];
    hasMore: boolean;
  };
}

/** 转发：pi session 列表 */
export interface EdgeInstanceSessionListMessage {
  type: "instance_session_list";
  payload: {
    instanceId: InstanceId;
    sessions: SessionListItem[];
    /** 过滤后的总数 */
    total: number;
    /** 是否还有更多 */
    hasMore: boolean;
  };
}

/** 转发：pi 主动退出 */
export interface EdgeInstanceQuitMessage {
  type: "instance_quit";
  payload: {
    instanceId: InstanceId;
  };
}

/** Spawn 结果回报 */
export interface EdgeSpawnResultMessage {
  type: "spawn_result";
  payload: {
    token: string;
    instanceId?: InstanceId;
    error?: string;
  };
}

/** 目录浏览结果 */
export interface EdgeBrowseResultMessage {
  type: "browse_result";
  payload: {
    token: string;
    /** 实际解析后的父目录（以 / 结尾） */
    parent?: string;
    /** 子目录列表 */
    entries?: BrowseEntry[];
    /** 是否因数量限制而截断 */
    truncated?: boolean;
    /** 错误信息 */
    error?: string;
  };
}

/** 目录浏览条目 */
export interface BrowseEntry {
  /** 目录名 */
  name: string;
}

/** 目录浏览结果 */
export interface BrowseResult {
  /** 实际解析后的父目录（以 / 结尾） */
  parent: string;
  /** 匹配的子目录列表 */
  entries: BrowseEntry[];
  /** 是否因数量限制而截断 */
  truncated: boolean;
}

// ============================================================
// Hub → Edge 消息
// ============================================================

export type HubToEdgeMessage =
  | HubEdgeRegisteredMessage
  | PongMessage
  | HubEdgePromptMessage
  | HubEdgeSteerMessage
  | HubEdgeAbortMessage
  | HubEdgeSetModelMessage
  | HubEdgeSetThinkingLevelMessage
  | HubEdgeCompactMessage
  | HubEdgeShutdownMessage
  | HubEdgeGetHistoryMessage
  | HubEdgeListSessionsMessage
  | HubEdgeNewSessionMessage
  | HubEdgeSwitchSessionMessage
  | HubEdgeSpawnMessage
  | HubEdgeBrowseMessage;

/** Edge 注册确认 */
export interface HubEdgeRegisteredMessage {
  type: "edge_registered";
  payload: {
    edgeId: string;
  };
}

/** 转发到 pi：发送用户消息 */
export interface HubEdgePromptMessage {
  type: "prompt";
  payload: {
    instanceId: InstanceId;
    message: string;
    /** 附带的图片列表（base64） */
    images?: ImagePayload[];
  };
}

/** 转发到 pi：发送 steer */
export interface HubEdgeSteerMessage {
  type: "steer";
  payload: {
    instanceId: InstanceId;
    message: string;
  };
}

/** 转发到 pi：中止 */
export interface HubEdgeAbortMessage {
  type: "abort";
  payload: {
    instanceId: InstanceId;
  };
}

/** 转发到 pi：切换模型 */
export interface HubEdgeSetModelMessage {
  type: "set_model";
  payload: {
    instanceId: InstanceId;
    provider: string;
    id: string;
  };
}

/** 转发到 pi：切换思考等级 */
export interface HubEdgeSetThinkingLevelMessage {
  type: "set_thinking_level";
  payload: {
    instanceId: InstanceId;
    level: ThinkingLevel;
  };
}

/** 转发到 pi：触发压缩 */
export interface HubEdgeCompactMessage {
  type: "compact";
  payload: {
    instanceId: InstanceId;
    customInstructions?: string;
  };
}

/** 转发到 pi：优雅退出 */
export interface HubEdgeShutdownMessage {
  type: "shutdown";
  payload: {
    instanceId: InstanceId;
  };
}

/** 转发到 pi：请求历史 */
export interface HubEdgeGetHistoryMessage {
  type: "get_history";
  payload: {
    instanceId: InstanceId;
    offset?: number;
    limit?: number;
  };
}

/** 转发到 pi：请求 session 列表 */
export interface HubEdgeListSessionsMessage {
  type: "list_sessions";
  payload: {
    instanceId: InstanceId;
    /** 跳过的条目数（默认 0） */
    offset?: number;
    /** 单页大小（默认 20） */
    limit?: number;
    /** 搜索关键字（匹配 name/firstMessage） */
    filter?: string;
  };
}

/** 转发到 pi：创建新 session */
export interface HubEdgeNewSessionMessage {
  type: "new_session";
  payload: {
    instanceId: InstanceId;
  };
}

/** 转发到 pi：切换 session */
export interface HubEdgeSwitchSessionMessage {
  type: "switch_session";
  payload: {
    instanceId: InstanceId;
    path: string;
  };
}

/** Hub 让 Edge spawn 新实例 */
export interface HubEdgeSpawnMessage {
  type: "spawn";
  payload: {
    cwd: string;
    token: string;
  };
}

/** Hub 让 Edge 浏览目录 */
export interface HubEdgeBrowseMessage {
  type: "browse";
  payload: {
    /** 用户输入的路径（可能是完整目录或带前缀的部分路径） */
    path: string;
    token: string;
  };
}

// ============================================================
// Edge 信息（Hub 侧存储 + 广播给 Browser）
// ============================================================

/** Edge 节点信息 */
export interface EdgeInfo {
  edgeId: string;
  hostname: string;
  /** Edge 所在机器的 home 目录 */
  homedir: string;
  /** 注册时间 */
  connectedAt: number;
  /** 最后心跳时间 */
  lastHeartbeat: number;
}

// ============================================================
// Edge 状态文件结构
// ============================================================

/** Edge daemon 运行时状态（存储于 ~/.paimon/edge.json） */
export interface EdgeState {
  pid: number;
  port: number;
  host: string;
  edgeId: string;
  hubUrl: string;
  startedAt: string; // ISO 8601
}

// ============================================================
// 常量
// ============================================================

export const DEFAULTS = {
  /** Hub 默认端口 */
  PORT: 8080 as number,
  /**
   * 心跳发送间隔 (ms)，Extension 和 Browser 共用。
   * 客户端每隔此时间发送一次 ping。
   */
  HEARTBEAT_INTERVAL: 5_000,
  /**
   * 心跳回复超时 (ms)。
   * - 客户端：发 ping 后等待 pong 的最长时间，超时则主动断开触发重连。
   * - Hub 侧：超时窗口 = INTERVAL + TIMEOUT，即允许丢失一次 ping
   *   后仍不断开，仅在连续无心跳超过该窗口才判定断连。
   */
  HEARTBEAT_TIMEOUT: 5_000,
  /** 实例断连后的保留时间 (ms)，超时才广播 disconnected */
  DISCONNECT_GRACE_PERIOD: 5_000,
  /** 重连退避序列 (ms) */
  RECONNECT_BACKOFF: [1000, 2000, 5000, 10_000, 30_000],
  /** 状态文件目录 */
  STATE_DIR: "~/.paimon",
  /** Hub 状态文件名（JSON，包含 pid/port/host 等） */
  STATE_FILE: "hub.json",
  /** Hub 日志基础名（目录名 & 文件名前缀） */
  HUB_LOG_NAME: "hub",
  /** Hub spawn 的实例运行时文件子目录（日志、FIFO） */
  INSTANCES_DIR: "instances",
  /** 默认 bind 地址（loopback，仅本机可访问） */
  HOST: "127.0.0.1" as string,
  /** Hub spawn 实例后等待其注册的超时 (ms) */
  SPAWN_REGISTER_TIMEOUT: 15_000,
  /** Edge 默认端口 */
  EDGE_PORT: 8033 as number,
  /** Edge 默认 bind 地址 */
  EDGE_HOST: "127.0.0.1" as string,
  /** Edge 连 Hub 的默认 URL */
  EDGE_HUB_URL: "ws://127.0.0.1:8080" as string,
  /** 目录浏览请求超时 (ms) */
  BROWSE_TIMEOUT: 5_000,
  /** 目录浏览最大返回条目数 */
  BROWSE_MAX_ENTRIES: 200,
  /** Edge 状态文件名 */
  EDGE_STATE_FILE: "edge.json" as string,
  /** Edge 日志基础名（目录名 & 文件名前缀） */
  EDGE_LOG_NAME: "edge" as string,
  /** Daemon 日志根子目录 */
  LOGS_DIR: "logs",
  /** 日志文件扩展名 */
  LOG_EXT: ".log",
  /** stdout/stderr 兜底日志后缀 */
  LOG_STD_SUFFIX: ".std",
  /** 单个日志文件最大大小（rotating-file-stream 格式） */
  LOG_MAX_SIZE: "10M",
  /** 保留历史日志文件最大数量 */
  LOG_MAX_FILES: 5,
  /** 是否 gzip 压缩历史日志 */
  LOG_COMPRESS: true,
  /** 实例日志清理扫描间隔 (ms) */
  LOG_CLEANUP_INTERVAL: 3_600_000,
  /** 无 pidfile 的历史遗留日志过期时间 (ms) */
  LOG_LEGACY_MAX_AGE: 7 * 24 * 3_600_000,
} as const;
