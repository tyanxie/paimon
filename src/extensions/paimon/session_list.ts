// Session 列表查询：获取、排序、过滤、分页

import { SessionManager } from "@earendil-works/pi-coding-agent";
import type {
  SessionListItem,
  ExtSessionListMessage,
} from "../../protocol/types";

export interface SessionListParams {
  offset?: number;
  limit?: number;
  filter?: string;
}

export interface SessionListResult {
  sessions: SessionListItem[];
  total: number;
  hasMore: boolean;
}

/**
 * 查询 session 列表，支持排序、过滤和分页
 * 注意：当前实现为全量读取后内存分页，session 数量较少时性能可接受
 */
export async function querySessionList(
  cwd: string,
  currentSessionFile: string | undefined,
  params?: SessionListParams,
): Promise<SessionListResult> {
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 20;
  const filter = params?.filter?.toLowerCase();

  const sessions = await SessionManager.list(cwd);

  // 映射 + 排序（按 modified 降序）
  const items: SessionListItem[] = sessions
    .map((s) => ({
      path: s.path,
      id: s.id,
      name: s.name,
      cwd: s.cwd,
      created: s.created.toISOString(),
      modified: s.modified.toISOString(),
      messageCount: s.messageCount,
      firstMessage: s.firstMessage.slice(0, 100),
      isCurrent: s.path === currentSessionFile,
    }))
    .sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
    );

  // 过滤
  let results = items;
  if (filter) {
    results = results.filter(
      (s) =>
        (s.name?.toLowerCase().includes(filter) ?? false) ||
        s.firstMessage.toLowerCase().includes(filter),
    );
  }

  const total = results.length;
  const sliced = results.slice(offset, offset + limit);
  const hasMore = offset + sliced.length < total;

  return { sessions: sliced, total, hasMore };
}

/** 构建空结果的 session_list 消息 */
export function emptySessionListMessage(): ExtSessionListMessage {
  return {
    type: "session_list",
    payload: { sessions: [], total: 0, hasMore: false },
  };
}
