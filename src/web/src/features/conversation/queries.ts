import type {
  InstanceQueryParams,
  SessionListItem,
  SessionListQueryParams,
} from "@protocol/types";
import { authFetch } from "../../utils/authFetch";
import { isRecord } from "../../utils/typeGuards";
import { isSessionEntry } from "./conversationData";
import type { SessionEntry } from "./types";

interface ConversationHistory {
  entries: SessionEntry[];
  hasMore: boolean;
  sessionId?: string;
}

interface ConversationSessions {
  sessions: SessionListItem[];
  total: number;
  hasMore: boolean;
  sessionId?: string;
}

function isHistory(value: unknown): value is ConversationHistory {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isSessionEntry) &&
    typeof value.hasMore === "boolean" &&
    (value.sessionId === undefined || typeof value.sessionId === "string")
  );
}

function isSessionListItem(value: unknown): value is SessionListItem {
  return (
    isRecord(value) &&
    ["path", "id", "cwd", "created", "modified", "firstMessage"].every(
      (key) => typeof value[key] === "string",
    ) &&
    (value.name === undefined || typeof value.name === "string") &&
    typeof value.messageCount === "number" &&
    typeof value.isCurrent === "boolean"
  );
}

function isSessions(value: unknown): value is ConversationSessions {
  return (
    isRecord(value) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isSessionListItem) &&
    typeof value.total === "number" &&
    typeof value.hasMore === "boolean" &&
    (value.sessionId === undefined || typeof value.sessionId === "string")
  );
}

async function query<T>(
  instanceId: string,
  kind: "history" | "sessions",
  params: SessionListQueryParams,
  signal: AbortSignal,
  validate: (value: unknown) => value is T,
  errorMessage: string,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const response = await authFetch(
    `/api/instance/${encodeURIComponent(instanceId)}/${kind}?${search}`,
    { signal, cache: "no-store" },
  );
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      isRecord(data) && typeof data.error === "string"
        ? data.error
        : errorMessage,
    );
  }
  if (!validate(data)) throw new Error(errorMessage);
  return data;
}

export function queryHistory(
  instanceId: string,
  params: InstanceQueryParams,
  signal: AbortSignal,
  errorMessage: string,
) {
  return query(instanceId, "history", params, signal, isHistory, errorMessage);
}

export function querySessionList(
  instanceId: string,
  params: SessionListQueryParams,
  signal: AbortSignal,
  errorMessage: string,
) {
  return query(
    instanceId,
    "sessions",
    params,
    signal,
    isSessions,
    errorMessage,
  );
}
