// Edge Server 入口：WS 接 pi extension + WS client 连 Hub
//
// Edge 是 pi 实例的本地聚合代理：
// - 监听本机端口，接收 pi extension 的 WebSocket 连接
// - 通过单条 WS 连接 Hub，多路复用上报所有本地实例
// - 接收 Hub 下发的指令，路由到正确的本地 pi 实例
// - 在本机 spawn pi 实例

import { hostname, homedir } from "node:os";
import type { ServerWebSocket, Server, BunRequest } from "bun";
import {
  DEFAULTS,
  type InstanceId,
  type InstanceInfo,
} from "../protocol/types";
import { isLoopbackHost, nonLoopbackWarning } from "../utils/host";
import { edgeId } from "./config";
import { edgeRegistry, type EdgeWsData } from "./registry";
import { UpstreamClient } from "./upstream";
import { handleExtensionMessage, handleUpstreamMessage } from "./router";
import { startLogCleanup, stopLogCleanup } from "./log-cleanup";
import * as log from "./logger";

const port = parseInt(
  process.env.PAIMON_EDGE_PORT || String(DEFAULTS.EDGE_PORT),
  10,
);
const host = process.env.PAIMON_EDGE_HOST || DEFAULTS.EDGE_HOST;

const hubUrl = process.env.PAIMON_HUB_URL || DEFAULTS.EDGE_HUB_URL;
const accessToken = process.env.PAIMON_ACCESS_TOKEN || "";

log.info(`Starting Edge server (id: ${edgeId}) on ${host}:${port}...`);
log.info(`Hub URL: ${hubUrl}`);

// 非 loopback 时警告
if (!isLoopbackHost(host)) {
  log.warn(nonLoopbackWarning(host));
}

// 创建上游 Hub 客户端
const upstream = new UpstreamClient({
  hubUrl,
  accessToken,
  onConnected() {
    // 连接 Hub 后先注册 Edge 自身
    upstream.send({
      type: "edge_register",
      payload: { edgeId, hostname: hostname(), homedir: homedir() },
    });
    // 重连后重新上报所有本地实例
    for (const inst of edgeRegistry.getAllInstances()) {
      upstream.send({
        type: "instance_register",
        payload: {
          instanceId: inst.id,
          hostname: inst.hostname,
          cwd: inst.cwd,
          model: inst.model,
          sessionId: inst.sessionId,
          sessionName: inst.sessionName,
          pid: inst.pid,
          availableModels: inst.availableModels,
          contextUsage: inst.contextUsage,
          gitBranch: inst.gitBranch ?? undefined,
          thinkingLevel: inst.thinkingLevel,
        },
      });
    }
  },
  onDisconnected() {
    log.warn("Lost connection to Hub, will reconnect...");
  },
  onMessage(msg) {
    handleUpstreamMessage(msg, upstream);
  },
});

// 设置 registry 变更回调：实例注册/注销时同步到 Hub
edgeRegistry.setChangeCallback(
  (
    event: "registered" | "updated" | "unregistered",
    instanceId: InstanceId,
    info?: InstanceInfo,
  ) => {
    if (!upstream.connected) return;

    switch (event) {
      case "registered": {
        if (!info) return;
        upstream.send({
          type: "instance_register",
          payload: {
            instanceId,
            hostname: info.hostname,
            cwd: info.cwd,
            model: info.model,
            sessionId: info.sessionId,
            sessionName: info.sessionName,
            pid: info.pid,
            availableModels: info.availableModels,
            contextUsage: info.contextUsage,
            gitBranch: info.gitBranch ?? undefined,
            thinkingLevel: info.thinkingLevel,
          },
        });
        break;
      }
      case "unregistered": {
        upstream.send({
          type: "instance_quit",
          payload: { instanceId },
        });
        break;
      }
      // "updated" 通过 router.ts 中 state 消息直接转发，此处无需额外处理
    }
  },
);

// 启动上游连接
upstream.connect();

// 心跳：定期向 Hub 发送 ping
const heartbeatInterval = setInterval(() => {
  if (upstream.connected) {
    upstream.send({ type: "ping" });
  }
}, DEFAULTS.HEARTBEAT_INTERVAL);

// 启动本地 WS server 接收 pi extension 连接
const server = Bun.serve<EdgeWsData>({
  hostname: host,
  port,

  routes: {
    "/ws/extension": (req: Request, server: Server<EdgeWsData>) => {
      const upgraded = server.upgrade(req, { data: {} });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    },
    "/api/health": {
      GET: () =>
        Response.json({ status: "ok", edgeId, uptime: process.uptime() }),
    },
    // CLI（如 paimon attach）通过本机 Edge 获取实例列表
    "/api/instances": {
      GET: () => Response.json({ instances: edgeRegistry.getAllInstances() }),
    },
    // CLI 通过本机 Edge 直接关闭实例
    "/api/instance/:id/shutdown": {
      POST: (req: BunRequest<"/api/instance/:id/shutdown">) => {
        const id = req.params.id;
        const inst = edgeRegistry.getInstance(id);
        if (!inst) {
          return Response.json(
            { error: `Instance ${id} not found` },
            { status: 404 },
          );
        }
        const ws = edgeRegistry.getInstanceWs(id);
        if (ws) {
          ws.send(JSON.stringify({ type: "shutdown" }));
        }
        return Response.json({ ok: true });
      },
    },
  },

  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws: ServerWebSocket<EdgeWsData>) {
      log.debug("Extension WebSocket opened");
    },

    message(ws: ServerWebSocket<EdgeWsData>, message: string | Buffer) {
      const raw = typeof message === "string" ? message : message.toString();
      handleExtensionMessage(ws, raw, upstream);
    },

    close(ws: ServerWebSocket<EdgeWsData>, code: number) {
      log.debug(`Extension WebSocket closed (code: ${code})`);
      const id = ws.data.instanceId;
      if (id) {
        const activeWs = edgeRegistry.getInstanceWs(id);
        if (activeWs === ws || activeWs === undefined) {
          edgeRegistry.startGracePeriod(id);
        }
      }
    },
  },
});

log.info(`Edge server listening on http://${host}:${server.port}`);

// 启动实例日志定期清理
startLogCleanup();

// 优雅退出
async function shutdown(signal: string): Promise<never> {
  log.info(`Received ${signal}, shutting down...`);
  clearInterval(heartbeatInterval);
  stopLogCleanup();
  upstream.disconnect();
  await server.stop(true);
  await log.shutdown();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
