// Edge 消息路由：处理来自 pi extension 和 Hub 的消息
//
// 两个方向：
// - pi → Edge（本地 WS）：注册、心跳、事件、状态、历史、session 列表、quit
// - Hub → Edge（上游 WS）：指令转发到本地 pi

import type { ServerWebSocket } from "bun";
import type { EdgeWsData } from "./registry";
import type {
  ExtensionToEdgeMessage,
  HubToEdgeMessage,
  EdgeToExtensionMessage,
  InstanceId,
} from "../protocol/types";
import { edgeRegistry } from "./registry";
import { resolveSpawn, spawnInstance, validateCwd } from "./spawner";
import * as log from "./logger";
import type { UpstreamClient } from "./upstream";

/** 处理 pi extension 发来的消息 */
export function handleExtensionMessage(
  ws: ServerWebSocket<EdgeWsData>,
  raw: string,
  upstream: UpstreamClient,
): void {
  let msg: ExtensionToEdgeMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    log.warn("Invalid JSON from extension");
    return;
  }

  switch (msg.type) {
    case "register": {
      const { instanceId } = edgeRegistry.register(ws, msg.payload);
      // 回复 pi 注册确认
      ws.send(
        JSON.stringify({ type: "registered", payload: { id: instanceId } }),
      );
      // 若携带 spawnToken，唤醒本地 spawn 等待
      if (msg.payload.spawnToken) {
        resolveSpawn(msg.payload.spawnToken, instanceId);
      }
      // 上报给 Hub（通过 registry 的 onChange 回调处理）
      break;
    }
    case "ping": {
      const id = edgeRegistry.findInstanceByWs(ws);
      if (id) {
        edgeRegistry.heartbeat(id);
        ws.send(JSON.stringify({ type: "pong" }));
      }
      break;
    }
    case "event": {
      const id = edgeRegistry.findInstanceByWs(ws);
      if (!id) return;
      // 转发给 Hub
      upstream.send({
        type: "instance_event",
        payload: {
          instanceId: id,
          event: msg.payload.event,
          data: msg.payload.data,
          timestamp: msg.payload.timestamp,
        },
      });
      break;
    }
    case "state": {
      const id = edgeRegistry.findInstanceByWs(ws);
      if (!id) return;
      edgeRegistry.updateState(id, msg.payload);
      // 上报给 Hub（通过 registry 的 onChange 回调 'updated' 处理）
      // 但 state 消息需要直接转发完整 payload
      upstream.send({
        type: "instance_state",
        payload: {
          instanceId: id,
          ...msg.payload,
        },
      });
      break;
    }
    case "history": {
      const id = edgeRegistry.findInstanceByWs(ws);
      if (!id) return;
      upstream.send({
        type: "instance_history",
        payload: {
          instanceId: id,
          entries: msg.payload.entries,
          hasMore: msg.payload.hasMore ?? false,
        },
      });
      break;
    }
    case "session_list": {
      const id = edgeRegistry.findInstanceByWs(ws);
      if (!id) return;
      upstream.send({
        type: "instance_session_list",
        payload: {
          instanceId: id,
          sessions: msg.payload.sessions,
        },
      });
      break;
    }
    case "quit": {
      const id = edgeRegistry.findInstanceByWs(ws);
      if (id) {
        edgeRegistry.unregister(id);
        // unregister 通过 onChange 回调通知 upstream
      }
      break;
    }
  }
}

/** 处理 Hub 下发的消息（转发给本地 pi 实例） */
export function handleUpstreamMessage(
  msg: HubToEdgeMessage,
  upstream: UpstreamClient,
): void {
  switch (msg.type) {
    case "edge_registered": {
      log.info(`Registered with Hub as edge: ${msg.payload.edgeId}`);
      break;
    }
    case "pong": {
      // Hub 回复心跳，无需额外处理
      break;
    }
    case "prompt": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "prompt",
        payload: { message: msg.payload.message },
      });
      break;
    }
    case "steer": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "steer",
        payload: { message: msg.payload.message },
      });
      break;
    }
    case "abort": {
      forwardToLocalInstance(msg.payload.instanceId, { type: "abort" });
      break;
    }
    case "set_model": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "set_model",
        payload: { provider: msg.payload.provider, id: msg.payload.id },
      });
      break;
    }
    case "set_thinking_level": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "set_thinking_level",
        payload: { level: msg.payload.level },
      });
      break;
    }
    case "compact": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "compact",
        payload: msg.payload.customInstructions
          ? { customInstructions: msg.payload.customInstructions }
          : undefined,
      });
      break;
    }
    case "shutdown": {
      forwardToLocalInstance(msg.payload.instanceId, { type: "shutdown" });
      break;
    }
    case "get_history": {
      const payload =
        msg.payload.offset !== undefined || msg.payload.limit !== undefined
          ? { offset: msg.payload.offset, limit: msg.payload.limit }
          : undefined;
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "get_history",
        payload,
      });
      break;
    }
    case "list_sessions": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "list_sessions",
      });
      break;
    }
    case "new_session": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "new_session",
      });
      break;
    }
    case "switch_session": {
      forwardToLocalInstance(msg.payload.instanceId, {
        type: "switch_session",
        payload: { path: msg.payload.path },
      });
      break;
    }
    case "spawn": {
      // Hub 委托 Edge 在本机 spawn 实例
      handleSpawnRequest(msg.payload.cwd, msg.payload.token, upstream);
      break;
    }
  }
}

/** 转发消息到本地 pi 实例 */
function forwardToLocalInstance(
  instanceId: InstanceId,
  message: EdgeToExtensionMessage,
): void {
  const ws = edgeRegistry.getInstanceWs(instanceId);
  if (!ws) {
    log.warn(`Instance ${instanceId} not found locally, cannot forward`);
    return;
  }
  ws.send(JSON.stringify(message));
}

/** 处理 spawn 请求 */
async function handleSpawnRequest(
  cwd: string,
  token: string,
  upstream: UpstreamClient,
): Promise<void> {
  try {
    // 前置校验 cwd
    const invalid = validateCwd(cwd);
    if (invalid) {
      upstream.send({
        type: "spawn_result",
        payload: { token, error: invalid },
      });
      return;
    }
    const instanceId = await spawnInstance(cwd, token);
    upstream.send({
      type: "spawn_result",
      payload: { token, instanceId },
    });
  } catch (err) {
    const message = (err as Error).message;
    log.error(`Spawn failed: ${message}`);
    upstream.send({
      type: "spawn_result",
      payload: { token, error: message },
    });
  }
}
