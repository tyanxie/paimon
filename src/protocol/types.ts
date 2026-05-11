// Paimon 通信协议类型定义
// Extension ↔ Hub ↔ Browser 所有消息结构

// ============================================================
// 基础类型
// ============================================================

/** pi 实例唯一标识（Hub 分配） */
export type InstanceId = string;

/** 上下文使用信息 */
export interface ContextUsageInfo {
  /** 当前 token 数（压缩后首次响应前为 null） */
  tokens: number | null;
  /** 模型上下文窗口大小 */
  contextWindow: number;
  /** 使用率百分比（0-100，tokens 为 null 时为 null） */
  percent: number | null;
}

/** pi 实例信息 */
export interface InstanceInfo {
  id: InstanceId;
  /** 工作目录 */
  cwd: string;
  /** 模型信息 */
  model: { provider: string; id: string };
  /** 当前 session 名 */
  sessionName?: string;
  /** pi 进程 PID */
  pid: number;
  /** 实例状态 */
  status: "idle" | "streaming";
  /** 上下文使用情况 */
  contextUsage?: ContextUsageInfo;
  /** Git 分支名（null = 非 git 仓库, "detached" = detached HEAD） */
  gitBranch?: string | null;
  /** 注册时间 */
  connectedAt: number;
  /** 最后心跳时间 */
  lastHeartbeat: number;
}

// ============================================================
// Extension → Hub 消息
// ============================================================

export type ExtensionToHubMessage =
  | ExtRegisterMessage
  | ExtHeartbeatMessage
  | ExtEventMessage
  | ExtStateMessage
  | ExtHistoryMessage;

/** 注册 */
export interface ExtRegisterMessage {
  type: "register";
  payload: {
    cwd: string;
    model: { provider: string; id: string };
    sessionName?: string;
    pid: number;
  };
}

/** 心跳 */
export interface ExtHeartbeatMessage {
  type: "heartbeat";
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
    status?: "idle" | "streaming";
    /** 上下文使用情况 */
    contextUsage?: ContextUsageInfo;
    /** Git 分支名 */
    gitBranch?: string | null;
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

// ============================================================
// Hub → Extension 消息
// ============================================================

export type HubToExtensionMessage =
  | HubRegisteredMessage
  | HubPromptMessage
  | HubSteerMessage
  | HubAbortMessage
  | HubPingMessage
  | HubGetHistoryMessage;

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

/** 心跳探测 */
export interface HubPingMessage {
  type: "ping";
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

// ============================================================
// Browser → Hub 消息
// ============================================================

export type BrowserToHubMessage =
  | BrowserSubscribeMessage
  | BrowserUnsubscribeMessage
  | BrowserPromptMessage
  | BrowserSteerMessage
  | BrowserAbortMessage
  | BrowserListMessage
  | BrowserHistoryMessage;

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

/** 请求实例列表 */
export interface BrowserListMessage {
  type: "list";
}

/** 请求实例历史消息 */
export interface BrowserHistoryMessage {
  type: "history";
  payload: {
    instanceId: InstanceId;
    /** 从末尾跳过的条目数 */
    offset?: number;
    /** 本次请求的最大条目数（按 turn 对齐） */
    limit?: number;
  };
}

// ============================================================
// Hub → Browser 消息
// ============================================================

export type HubToBrowserMessage =
  | HubInstanceListMessage
  | HubInstanceUpdateMessage
  | HubForwardedEventMessage
  | HubHistoryMessage
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

/** 错误 */
export interface HubErrorMessage {
  type: "error";
  payload: {
    message: string;
    code?: string;
  };
}

// ============================================================
// 常量
// ============================================================

export const DEFAULTS = {
  /** Hub 默认端口 */
  PORT: 8080 as number,
  /** 心跳间隔 (ms) */
  HEARTBEAT_INTERVAL: 15_000,
  /** 心跳超时 (ms) */
  HEARTBEAT_TIMEOUT: 10_000,
  /** 重连退避序列 (ms) */
  RECONNECT_BACKOFF: [1000, 2000, 5000, 10_000, 30_000],
  /** 状态文件目录 */
  STATE_DIR: "~/.paimon",
  /** PID 文件名 */
  PID_FILE: "hub.pid",
  /** 日志文件名 */
  LOG_FILE: "hub.log",
  /** 端口文件名 */
  PORT_FILE: "hub.port",
} as const;
