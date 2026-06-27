// 消息路由：处理来自 Edge 和 Browser 的消息
//
// Hub 不再直接与 pi extension 通信，所有 pi 相关消息通过 Edge 中转。

import type { ServerWebSocket } from "bun";
import type { WsData, BrowserWsData } from "./edge";
import type {
  EdgeToHubMessage,
  BrowserToHubMessage,
  HubToEdgeMessage,
  InstanceId,
} from "../protocol/types";
import { hubRegistry } from "./edge";
import * as log from "./logger";

/** 处理 Edge 消息 */
export function handleEdgeMessage(
  ws: ServerWebSocket<WsData>,
  raw: string,
): void {
  let msg: EdgeToHubMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    log.warn("Invalid JSON from edge");
    return;
  }

  switch (msg.type) {
    case "edge_register": {
      const info = hubRegistry.registerEdge(
        ws,
        msg.payload.edgeId,
        msg.payload.hostname,
        msg.payload.homedir,
      );
      ws.send(
        JSON.stringify({
          type: "edge_registered",
          payload: { edgeId: info.edgeId },
        }),
      );
      break;
    }
    case "ping": {
      const edgeId = hubRegistry.findEdgeByWs(ws);
      if (edgeId) {
        hubRegistry.edgeHeartbeat(edgeId);
        ws.send(JSON.stringify({ type: "pong" }));
      }
      break;
    }
    case "instance_register": {
      const edgeId = hubRegistry.findEdgeByWs(ws);
      if (!edgeId) return;
      hubRegistry.registerInstance(edgeId, msg.payload.instanceId, {
        hostname: msg.payload.hostname,
        cwd: msg.payload.cwd,
        model: msg.payload.model,
        sessionId: msg.payload.sessionId,
        sessionName: msg.payload.sessionName,
        pid: msg.payload.pid,
        availableModels: msg.payload.availableModels,
        contextUsage: msg.payload.contextUsage,
        gitBranch: msg.payload.gitBranch,
        thinkingLevel: msg.payload.thinkingLevel,
      });
      break;
    }
    case "instance_event": {
      // 转发给订阅了该实例的浏览器
      const subscribers = hubRegistry.getSubscribers(msg.payload.instanceId);
      if (subscribers.length > 0) {
        const forwarded = JSON.stringify({
          type: "forwarded_event",
          payload: {
            instanceId: msg.payload.instanceId,
            event: msg.payload.event,
            data: msg.payload.data,
            timestamp: msg.payload.timestamp,
          },
        });
        for (const browser of subscribers) {
          browser.send(forwarded);
        }
      }
      break;
    }
    case "instance_state": {
      const { instanceId, ...state } = msg.payload;
      hubRegistry.updateInstanceState(instanceId, state);
      break;
    }
    case "instance_history": {
      const subscribers = hubRegistry.getSubscribers(msg.payload.instanceId);
      if (subscribers.length > 0) {
        const historyMsg = JSON.stringify({
          type: "history",
          payload: {
            instanceId: msg.payload.instanceId,
            messages: msg.payload.entries,
            hasMore: msg.payload.hasMore,
          },
        });
        for (const browser of subscribers) {
          browser.send(historyMsg);
        }
      }
      break;
    }
    case "instance_session_list": {
      const subscribers = hubRegistry.getSubscribers(msg.payload.instanceId);
      if (subscribers.length > 0) {
        const sessionListMsg = JSON.stringify({
          type: "session_list",
          payload: {
            instanceId: msg.payload.instanceId,
            sessions: msg.payload.sessions,
            total: msg.payload.total,
            hasMore: msg.payload.hasMore,
          },
        });
        for (const browser of subscribers) {
          browser.send(sessionListMsg);
        }
      }
      break;
    }
    case "instance_quit": {
      hubRegistry.unregisterInstance(msg.payload.instanceId);
      break;
    }
    case "spawn_result": {
      hubRegistry.resolveSpawn(
        msg.payload.token,
        msg.payload.instanceId,
        msg.payload.error,
      );
      break;
    }
    case "browse_result": {
      const { token, parent, entries, truncated, error } = msg.payload;
      if (error) {
        hubRegistry.resolveBrowse(token, undefined, error);
      } else if (parent && entries) {
        hubRegistry.resolveBrowse(token, {
          parent,
          entries,
          truncated: truncated ?? false,
        });
      } else {
        hubRegistry.resolveBrowse(
          token,
          undefined,
          "Invalid browse_result: missing parent or entries",
        );
      }
      break;
    }
  }
}

/** 处理 Browser 消息 */
export function handleBrowserMessage(
  ws: ServerWebSocket<WsData>,
  raw: string,
): void {
  let msg: BrowserToHubMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    log.warn("Invalid JSON from browser");
    return;
  }

  switch (msg.type) {
    case "ping": {
      hubRegistry.browserHeartbeat(ws);
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    }
    case "list": {
      const instances = hubRegistry.getAllInstances();
      ws.send(
        JSON.stringify({ type: "instance_list", payload: { instances } }),
      );
      break;
    }
    case "subscribe": {
      const wsData = ws.data as BrowserWsData;
      wsData.subscriptions?.add(msg.payload.instanceId);
      log.debug(`Browser subscribed to ${msg.payload.instanceId}`);
      break;
    }
    case "unsubscribe": {
      const wsData = ws.data as BrowserWsData;
      wsData.subscriptions?.delete(msg.payload.instanceId);
      log.debug(`Browser unsubscribed from ${msg.payload.instanceId}`);
      break;
    }
    // ── 以下消息透传给 Edge（payload 原样转发） ──
    case "prompt":
    case "steer":
    case "abort":
    case "set_model":
    case "set_thinking_level":
    case "list_sessions":
    case "new_session":
    case "switch_session":
    case "compact":
    case "shutdown":
    case "get_history": {
      const payload = msg.payload as { instanceId: InstanceId };
      forwardToEdge(ws, payload.instanceId, {
        type: msg.type,
        payload: msg.payload,
      } as HubToEdgeMessage);
      break;
    }
  }
}

/** 转发指令到 Edge（通过 instanceId 查找所属 edge） */
function forwardToEdge(
  browserWs: ServerWebSocket<WsData>,
  instanceId: InstanceId,
  message: HubToEdgeMessage,
): void {
  const edgeId = hubRegistry.getInstanceEdgeId(instanceId);
  if (!edgeId) {
    browserWs.send(
      JSON.stringify({
        type: "error",
        payload: {
          message: `Instance ${instanceId} not found`,
          code: "INSTANCE_NOT_FOUND",
        },
      }),
    );
    return;
  }

  const edgeWs = hubRegistry.getEdgeWs(edgeId);
  if (!edgeWs) {
    browserWs.send(
      JSON.stringify({
        type: "error",
        payload: {
          message: `Edge ${edgeId} is disconnected`,
          code: "EDGE_DISCONNECTED",
        },
      }),
    );
    return;
  }

  edgeWs.send(JSON.stringify(message));
}

/** 转发指令到 Edge（HTTP 语境，返回 Response 或 null） */
export function forwardToEdgeForHttp(
  instanceId: InstanceId,
  message: HubToEdgeMessage,
): Response | null {
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

  edgeWs.send(JSON.stringify(message));
  return null;
}
