import { randomUUID } from "node:crypto";
import type {
  HistoryResult,
  InstanceQueryParams,
  InstanceQueryReply,
  SessionListQueryParams,
  SessionListResult,
} from "../protocol/types";
import { DEFAULTS } from "../protocol/types";
import { hubRegistry } from "./edge";
import { PendingRequests } from "./pending";

const pendingHistories = new PendingRequests<HistoryResult>();
const pendingSessions = new PendingRequests<SessionListResult>();

export function resolveHistory(reply: InstanceQueryReply<HistoryResult>): void {
  if ("error" in reply) pendingHistories.reject(reply.token, reply.error);
  else pendingHistories.resolve(reply.token, reply.result);
}

export function resolveSessionList(
  reply: InstanceQueryReply<SessionListResult>,
): void {
  if ("error" in reply) pendingSessions.reject(reply.token, reply.error);
  else pendingSessions.resolve(reply.token, reply.result);
}

/** HTTP 入口校验分页参数，内部 WS 只负责传递查询与关联结果 */
export async function handleInstanceQuery(
  instanceId: string,
  kind: "history" | "sessions",
  search: URLSearchParams,
): Promise<Response> {
  const params: SessionListQueryParams = {};
  for (const key of ["offset", "limit"] as const) {
    const raw = search.get(key);
    if (raw === null) continue;
    const value = Number(raw);
    if (
      !raw.trim() ||
      !Number.isSafeInteger(value) ||
      value < (key === "limit" ? 1 : 0)
    ) {
      return Response.json({ error: `Invalid ${key}` }, { status: 400 });
    }
    params[key] = value;
  }
  params.sessionId = search.get("sessionId") ?? undefined;
  if (kind === "sessions") params.filter = search.get("filter") ?? undefined;

  const edgeId = hubRegistry.getInstanceEdgeId(instanceId);
  if (!edgeId) {
    return Response.json(
      { error: `Instance ${instanceId} not found` },
      { status: 404 },
    );
  }
  const edgeWs = hubRegistry.getEdgeWs(edgeId);
  if (!edgeWs) {
    return Response.json(
      { error: `Edge ${edgeId} is disconnected` },
      { status: 502 },
    );
  }

  const token = randomUUID();
  const timeout = DEFAULTS.INSTANCE_QUERY_TIMEOUT;
  const pending =
    kind === "history"
      ? pendingHistories.register(token, timeout)
      : pendingSessions.register(token, timeout);
  const payload: InstanceQueryParams & { instanceId: string; token: string } = {
    instanceId,
    token,
    ...params,
  };
  try {
    edgeWs.send(
      JSON.stringify({
        type: kind === "history" ? "get_history" : "list_sessions",
        payload,
      }),
    );
    const result = await pending;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 发送失败也释放等待记录，避免计时器继续存活
    if (kind === "history") pendingHistories.reject(token, message);
    else pendingSessions.reject(token, message);
    await pending.catch(() => {});
    return Response.json({ error: message }, { status: 502 });
  }
}
