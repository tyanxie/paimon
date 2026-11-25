import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { HubToEdgeMessage } from "../protocol/types";
import { DEFAULTS } from "../protocol/types";
import type { WsData } from "./edge";
import * as logger from "../utils/logger";

// 只测试请求路由，不启动服务或写入真实日志
const loggerSpy = spyOn(logger, "createLogger").mockReturnValue({
  info() {},
  warn() {},
  error() {},
  debug() {},
  async shutdown() {},
});
const { hubRegistry } = await import("./edge");
const { handleInstanceQuery } = await import("./queries");
const { handleEdgeMessage } = await import("./router");
loggerSpy.mockRestore();

let messages: HubToEdgeMessage[];
let instanceEdgeSpy: ReturnType<
  typeof spyOn<typeof hubRegistry, "getInstanceEdgeId">
>;
let edgeWsSpy: ReturnType<typeof spyOn<typeof hubRegistry, "getEdgeWs">>;
let broadcastSpy: ReturnType<
  typeof spyOn<typeof hubRegistry, "getSubscribers">
>;
const instanceId = "http-query-instance";
const edge = {
  data: { role: "edge", edgeId: "query-edge" },
} as ServerWebSocket<WsData>;

function tokenAt(index: number): string {
  const message = messages[index];
  if (message?.type !== "get_history" && message?.type !== "list_sessions") {
    throw new Error("Expected instance query");
  }
  return message.payload.token;
}

function reply(kind: "history" | "sessions", token: string, label: string) {
  const result =
    kind === "history"
      ? {
          entries: [{ type: "custom", id: label }],
          hasMore: false,
          sessionId: "session",
        }
      : {
          sessions: [],
          total: label === "A" ? 1 : 2,
          hasMore: false,
          sessionId: "session",
        };
  handleEdgeMessage(
    edge,
    JSON.stringify({
      type: kind === "history" ? "instance_history" : "instance_session_list",
      payload: { instanceId, token, result },
    }),
  );
  return result;
}

beforeEach(() => {
  messages = [];
  instanceEdgeSpy = spyOn(hubRegistry, "getInstanceEdgeId").mockReturnValue(
    "query-edge",
  );
  edgeWsSpy = spyOn(hubRegistry, "getEdgeWs").mockReturnValue({
    send(raw: string) {
      messages.push(JSON.parse(raw));
      return raw.length;
    },
  } as ServerWebSocket<WsData>);
  broadcastSpy = spyOn(hubRegistry, "getSubscribers").mockReturnValue([]);
});

afterEach(() => {
  instanceEdgeSpy.mockRestore();
  edgeWsSpy.mockRestore();
  broadcastSpy.mockRestore();
});

for (const kind of ["history", "sessions"] as const) {
  describe(`${kind} HTTP 请求隔离`, () => {
    test("相同实例的并发查询按 token 定向返回，逆序回包不广播", async () => {
      let aFinished = false;
      const a = handleInstanceQuery(
        instanceId,
        kind,
        new URLSearchParams("offset=0&sessionId=session"),
      );
      void a.then(() => {
        aFinished = true;
      });
      const b = handleInstanceQuery(
        instanceId,
        kind,
        new URLSearchParams("offset=20&filter=B&sessionId=session"),
      );
      expect(tokenAt(0)).not.toBe(tokenAt(1));
      const bResult = reply(kind, tokenAt(1), "B");
      const bResponse = await b;
      expect(bResponse.status).toBe(200);
      expect(await bResponse.json()).toEqual(bResult);
      expect(aFinished).toBe(false);
      const aResult = reply(kind, tokenAt(0), "A");
      const aResponse = await a;
      expect(await aResponse.json()).toEqual(aResult);
      expect(aResponse.headers.get("Cache-Control")).toBe("no-store");
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    test("10 秒未回包返回错误，迟到结果不影响下一次查询", async () => {
      expect(DEFAULTS.INSTANCE_QUERY_TIMEOUT).toBe(10_000);
      const start = performance.now();
      const expired = await handleInstanceQuery(
        instanceId,
        kind,
        new URLSearchParams(),
      );
      expect(performance.now() - start).toBeGreaterThanOrEqual(9_900);
      expect(expired.status).toBe(502);
      expect(await expired.json()).toEqual({
        error: "Request timed out (10s)",
      });
      let nextFinished = false;
      const next = handleInstanceQuery(instanceId, kind, new URLSearchParams());
      void next.then(() => {
        nextFinished = true;
      });
      reply(kind, tokenAt(0), "A");
      await Promise.resolve();
      expect(nextFinished).toBe(false);
      const result = reply(kind, tokenAt(1), "B");
      expect(await (await next).json()).toEqual(result);
      expect(broadcastSpy).not.toHaveBeenCalled();
    }, 15_000);
  });
}
