// Pi Extension 入口：连接 Hub、转发事件、接收指令

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULTS } from "../../protocol/types";
import type { HubToExtensionMessage } from "../../protocol/types";
import { HubClient } from "./client";
import { serializeEvent, FORWARDED_EVENTS } from "./serializer";

export default function (pi: ExtensionAPI) {
  const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);

  let registered = false;

  // 创建 Hub 客户端
  const client = new HubClient({
    port,
    onConnected() {
      // 连接成功后发送基础注册信息
      client.send({
        type: "register",
        payload: {
          cwd: process.cwd(),
          model: { provider: "unknown", id: "unknown" },
          pid: process.pid,
        },
      });
    },
    onDisconnected() {
      registered = false;
    },
    onMessage(msg: HubToExtensionMessage) {
      if (msg.type === "registered") {
        registered = true;
      }
      handleHubMessage(pi, msg);
    },
  });

  // 启动连接
  client.connect();

  // 转发 pi 事件到 Hub
  for (const eventName of FORWARDED_EVENTS) {
    pi.on(eventName as any, async (event: any) => {
      if (!client.connected) return;
      client.send(serializeEvent(eventName, event));
    });
  }

  // 转发状态变更 + 更新注册信息（确保 model 正确）
  pi.on("agent_start", async (_event, ctx) => {
    if (ctx.model) {
      client.send({
        type: "register",
        payload: {
          cwd: ctx.cwd,
          model: { provider: ctx.model.provider, id: ctx.model.id },
          sessionName: ctx.sessionManager.getSessionFile() ?? undefined,
          pid: process.pid,
        },
      });
    }
    client.send({ type: "state", payload: { status: "streaming" } });
  });

  pi.on("agent_end", async () => {
    client.send({ type: "state", payload: { status: "idle" } });
  });

  // 心跳
  const heartbeatInterval = setInterval(() => {
    if (client.connected) {
      client.send({ type: "heartbeat" });
    }
  }, DEFAULTS.HEARTBEAT_INTERVAL);

  // session_start 时发送更精确的注册信息
  pi.on("session_start", async (_event, ctx) => {
    if (client.connected && ctx.model) {
      client.send({
        type: "register",
        payload: {
          cwd: ctx.cwd,
          model: { provider: ctx.model.provider, id: ctx.model.id },
          sessionName: ctx.sessionManager.getSessionFile() ?? undefined,
          pid: process.pid,
        },
      });
    }
  });

  // 清理
  pi.on("session_shutdown", async () => {
    clearInterval(heartbeatInterval);
    client.disconnect();
  });
}

/** 处理 Hub 下发的指令 */
function handleHubMessage(pi: ExtensionAPI, msg: HubToExtensionMessage): void {
  switch (msg.type) {
    case "prompt":
      pi.sendUserMessage(msg.payload.message);
      break;
    case "steer":
      pi.sendUserMessage(msg.payload.message, { deliverAs: "steer" });
      break;
    case "abort":
      (pi as any).abort?.();
      break;
    case "ping":
    case "registered":
      break;
  }
}
