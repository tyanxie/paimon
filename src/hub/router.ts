// 消息路由：处理来自 Extension 和 Browser 的消息

import type { ServerWebSocket } from "bun";
import type { WsData } from "./registry";
import type {
  ExtensionToHubMessage,
  BrowserToHubMessage,
} from "../protocol/types";
import { registry } from "./registry";
import { forwardToInstanceForWs } from "./forward";
import { resolveSpawn } from "./spawner";
import * as log from "./logger";

/** 处理 Extension 消息 */
export function handleExtensionMessage(
  ws: ServerWebSocket<WsData>,
  raw: string,
): void {
  let msg: ExtensionToHubMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    log.warn("Invalid JSON from extension");
    return;
  }

  switch (msg.type) {
    case "register": {
      const info = registry.register(ws, msg.payload);
      // 回复注册确认
      ws.send(JSON.stringify({ type: "registered", payload: { id: info.id } }));
      // 若携带 spawnToken，说明是 Hub spawn 的实例，唤醒对应的创建请求
      if (msg.payload.spawnToken) {
        resolveSpawn(msg.payload.spawnToken, info.id);
      }
      break;
    }
    case "ping": {
      const id = registry.findInstanceByWs(ws);
      if (id) {
        registry.heartbeat(id);
        // 回复 pong 作为确认
        ws.send(JSON.stringify({ type: "pong" }));
      }
      break;
    }
    case "event": {
      const id = registry.findInstanceByWs(ws);
      if (!id) return;

      // 转发给订阅了该实例的浏览器
      const subscribers = registry.getSubscribers(id);
      if (subscribers.length > 0) {
        const forwarded = JSON.stringify({
          type: "forwarded_event",
          payload: {
            instanceId: id,
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
    case "state": {
      const id = registry.findInstanceByWs(ws);
      if (id) {
        registry.updateState(id, msg.payload);
      }
      break;
    }
    case "history": {
      const id = registry.findInstanceByWs(ws);
      if (!id) return;

      // 转发给订阅了该实例的浏览器
      const subscribers = registry.getSubscribers(id);
      if (subscribers.length > 0) {
        const historyMsg = JSON.stringify({
          type: "history",
          payload: {
            instanceId: id,
            messages: msg.payload.entries,
            hasMore: msg.payload.hasMore ?? false,
          },
        });
        for (const browser of subscribers) {
          browser.send(historyMsg);
        }
      }
      break;
    }
    case "session_list": {
      const id = registry.findInstanceByWs(ws);
      if (!id) return;

      // 转发给订阅了该实例的浏览器
      const subscribers = registry.getSubscribers(id);
      if (subscribers.length > 0) {
        const sessionListMsg = JSON.stringify({
          type: "session_list",
          payload: {
            instanceId: id,
            sessions: msg.payload.sessions,
          },
        });
        for (const browser of subscribers) {
          browser.send(sessionListMsg);
        }
      }
      break;
    }
    case "quit": {
      // 实例主动退出，立即注销（跳过 grace period）
      const id = registry.findInstanceByWs(ws);
      if (id) {
        registry.unregister(id);
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
      // 心跳回复 + 重置超时
      registry.browserHeartbeat(ws);
      ws.send(JSON.stringify({ type: "pong" }));
      break;
    }
    case "list": {
      const instances = registry.getAllInstances();
      ws.send(
        JSON.stringify({ type: "instance_list", payload: { instances } }),
      );
      break;
    }
    case "subscribe": {
      ws.data.subscriptions?.add(msg.payload.instanceId);
      log.debug(`Browser subscribed to ${msg.payload.instanceId}`);
      break;
    }
    case "unsubscribe": {
      ws.data.subscriptions?.delete(msg.payload.instanceId);
      log.debug(`Browser unsubscribed from ${msg.payload.instanceId}`);
      break;
    }
    case "history": {
      // 向 Extension 请求历史（透传 offset/limit）
      const payload =
        msg.payload.offset !== undefined || msg.payload.limit !== undefined
          ? { offset: msg.payload.offset, limit: msg.payload.limit }
          : undefined;
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "get_history",
        payload,
      });
      break;
    }
    case "prompt": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "prompt",
        payload: { message: msg.payload.message },
      });
      break;
    }
    case "steer": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "steer",
        payload: { message: msg.payload.message },
      });
      break;
    }
    case "abort": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, { type: "abort" });
      break;
    }
    case "set_model": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "set_model",
        payload: { provider: msg.payload.provider, id: msg.payload.id },
      });
      break;
    }
    case "set_thinking_level": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "set_thinking_level",
        payload: { level: msg.payload.level },
      });
      break;
    }
    case "list_sessions": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "list_sessions",
      });
      break;
    }
    case "new_session": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "new_session",
      });
      break;
    }
    case "switch_session": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "switch_session",
        payload: { path: msg.payload.path },
      });
      break;
    }
    case "compact": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, {
        type: "compact",
        payload: msg.payload.customInstructions
          ? { customInstructions: msg.payload.customInstructions }
          : undefined,
      });
      break;
    }
    case "shutdown": {
      forwardToInstanceForWs(ws, msg.payload.instanceId, { type: "shutdown" });
      break;
    }
  }
}
