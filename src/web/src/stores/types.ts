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

// ── ConversationLoadState ──

export type ConversationLoadState =
  | "idle"
  | "refreshing"
  | "loadingMore"
  | "error";
