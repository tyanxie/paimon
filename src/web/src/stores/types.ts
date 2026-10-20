// 全局状态共享类型

// ── SessionEntry：对话条目模型 ──

/** 统一的 session entry（来自 getBranch 或实时事件构造） */
export interface SessionEntry {
  type: string;
  id?: string;
  /** 前端内部使用的稳定渲染 key，不参与协议传输 */
  __renderKey?: string;
  parentId?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: unknown;
    [key: string]: unknown;
  };
  summary?: string;
  [key: string]: unknown;
}

/** 获取 entry 的稳定渲染 key（id 或 __renderKey） */
export function getSessionEntryRenderKey(entry: SessionEntry): string {
  const key = entry.id ?? entry.__renderKey;
  if (!key) {
    throw new Error(
      `SessionEntry missing stable render key: type=${entry.type}`,
    );
  }
  return key;
}

/** 当前页面接收到的工具执行状态 */
export type ToolExecutionState = {
  /** 接收到开始事件时的 performance.now()，用于运行期间计时 */
  startedAt?: number;
} & (
  | {
      status: "running";
      partialResult?: unknown;
    }
  | {
      status: "completed";
      result: unknown;
      isError: boolean;
      durationMs?: number;
    }
);

// ── 对话展示模型 ──

/** 保留原始消息身份、时间和 content block 位置 */
export interface ConversationSource {
  key: string;
  entry: SessionEntry;
  blockIndex?: number;
  streaming: boolean;
}

export type ConversationToolState =
  | {
      status: "running";
      execution: Extract<ToolExecutionState, { status: "running" }>;
    }
  | {
      status: "completed" | "error";
      result: unknown;
      resultEntry?: SessionEntry;
      durationMs?: number;
    }
  | { status: "aborted" | "unknown" };

export interface ConversationTool {
  type: "tool";
  key: string;
  source: ConversationSource;
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  state: ConversationToolState;
}

interface ConversationThinking {
  type: "thinking";
  key: string;
  source: ConversationSource;
  content: string;
}

export interface ConversationExecution {
  type: "execution";
  key: string;
  items: (ConversationTool | ConversationThinking)[];
  counts: Record<ConversationToolState["status"], number>;
}

interface ConversationSystemEvent {
  type: "system";
  key: string;
  entry: SessionEntry;
}

type ConversationPart =
  | ConversationExecution
  | ConversationSystemEvent
  | {
      type: "text";
      key: string;
      source: ConversationSource;
      content: string;
    }
  | {
      type: "error";
      key: string;
      source: ConversationSource;
      content: string;
      stopReason: "error" | "aborted";
    };

export interface ConversationReply {
  type: "reply";
  key: string;
  userEntryKey?: string;
  /** 回复范围内的原始条目，用于时间与消息归属 */
  entries: SessionEntry[];
  parts: ConversationPart[];
}

export type ConversationItem =
  | { type: "user"; key: string; entry: SessionEntry }
  | ConversationReply
  | ConversationSystemEvent;

// ── ConversationLoadState ──

export type ConversationLoadState =
  | "idle"
  | "refreshing"
  | "loadingMore"
  | "error";
