// Hub Server 入口：HTTP + WebSocket + 静态文件服务
//
// Hub 只与 Edge 和 Browser 通信，不再直接连接 pi extension。
// Edge 通过 /ws/edge 连接 Hub，Browser 通过 /ws/browser 连接。

import { existsSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import type { ServerWebSocket, Server, BunRequest } from "bun";
import { randomUUID } from "node:crypto";
import { DEFAULTS } from "../protocol/types";
import { isLoopbackHost, nonLoopbackWarning } from "../utils/host";
import { isCompiled } from "../utils/runtime";
import { extractToken, verifyAccessToken, isAuthDisabled } from "./auth";
import {
  hubRegistry,
  type WsData,
  type EdgeWsData,
  type BrowserWsData,
} from "./edge";
import {
  handleEdgeMessage,
  handleBrowserMessage,
  forwardToEdgeForHttp,
} from "./router";
import * as log from "./logger";

const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);
const host = process.env.PAIMON_HOST || DEFAULTS.HOST;
const accessToken = process.env.PAIMON_ACCESS_TOKEN || "";
const authEnabled = !isAuthDisabled() && accessToken.length > 0;

// 静态文件目录：编译模式从二进制上级的 web/ 读取（bin/paimon → ../web），源码模式从项目根 dist/web 读取
const webDir = isCompiled
  ? resolve(dirname(process.execPath), "../web")
  : resolve(import.meta.dir, "../../dist/web");

// 启动前校验 dist/web 存在
if (!existsSync(webDir)) {
  log.error(`dist/web/ not found at ${webDir}. Run 'vite build' first.`);
  process.exit(1);
}
if (!existsSync(resolve(webDir, "index.html"))) {
  log.error(`dist/web/index.html not found. Run 'vite build' first.`);
  process.exit(1);
}

/**
 * 认证请求：提取 token 并校验，失败返回 401 Response。
 * 认证关闭时始终返回 null（放行）。
 */
function authenticate(req: Request): Response | null {
  if (!authEnabled) return null;
  if (!verifyAccessToken(extractToken(req), accessToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * 升级 WebSocket 连接，并附加 per-connection 上下文数据。
 */
function upgradeWs(
  req: Request,
  server: Server<WsData>,
  data: WsData,
): Response | undefined {
  const upgraded = server.upgrade(req, { data });
  if (!upgraded) {
    return new Response("WebSocket upgrade failed", { status: 400 });
  }
  return undefined;
}

log.info(`Starting Hub server on ${host}:${port}...`);
if (authEnabled) {
  log.info("Authentication enabled");
} else {
  log.warn("Authentication DISABLED — all requests will be accepted");
}

// 非 loopback bind 时警告
if (!isLoopbackHost(host)) {
  log.warn(nonLoopbackWarning(host));
}

const server = Bun.serve<WsData>({
  hostname: host,
  port,

  routes: {
    // ── WebSocket 升级端点 ──
    // /ws/edge：Edge 节点连接（注册 + 转发实例信息 + 接收指令）
    "/ws/edge": (req: Request, server: Server<WsData>) => {
      const denied = authenticate(req);
      if (denied) return denied;
      return upgradeWs(req, server, { role: "edge" } as EdgeWsData);
    },
    // /ws/browser：Web 控制面板连接
    "/ws/browser": (req: Request, server: Server<WsData>) => {
      const denied = authenticate(req);
      if (denied) return denied;
      return upgradeWs(req, server, {
        role: "browser",
        subscriptions: new Set(),
      } as BrowserWsData);
    },

    // ── JSON API ──
    "/api/instances": {
      GET: (req: Request) => {
        const denied = authenticate(req);
        if (denied) return denied;
        return Response.json({ instances: hubRegistry.getAllInstances() });
      },
      // 在指定 Edge 上 spawn 一个 headless pi 实例
      POST: async (req: Request) => {
        const denied = authenticate(req);
        if (denied) return denied;
        let body: { cwd?: string; edgeId?: string };
        try {
          body = (await req.json()) as { cwd?: string; edgeId?: string };
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const cwd = body.cwd?.trim() ?? "";
        if (!cwd) {
          return Response.json(
            { error: "Working directory is required" },
            { status: 400 },
          );
        }

        // 确定目标 Edge
        let edgeId = body.edgeId?.trim();
        if (!edgeId) {
          // 未指定 edgeId 时，选择第一个可用的 edge
          const edges = hubRegistry.getAllEdges();
          if (edges.length === 0) {
            return Response.json(
              { error: "No edge nodes connected" },
              { status: 503 },
            );
          }
          edgeId = edges[0].edgeId;
        }

        const edgeWs = hubRegistry.getEdgeWs(edgeId);
        if (!edgeWs) {
          return Response.json(
            { error: `Edge ${edgeId} is not connected` },
            { status: 502 },
          );
        }

        // 生成 token，发 spawn 指令给 Edge，等待结果
        const token = randomUUID();
        const spawnPromise = hubRegistry.registerPendingSpawn(token);

        edgeWs.send(
          JSON.stringify({
            type: "spawn",
            payload: { cwd, token },
          }),
        );

        try {
          const instanceId = await spawnPromise;
          return Response.json({ instanceId });
        } catch (err) {
          const message = (err as Error).message;
          log.error(`Failed to spawn instance on edge ${edgeId}: ${message}`);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    "/api/edges": {
      GET: (req: Request) => {
        const denied = authenticate(req);
        if (denied) return denied;
        return Response.json({ edges: hubRegistry.getAllEdges() });
      },
    },
    "/api/edges/:edgeId/browse": {
      GET: async (req: BunRequest<"/api/edges/:edgeId/browse">) => {
        const denied = authenticate(req);
        if (denied) return denied;
        const { edgeId } = req.params;
        const url = new URL(req.url);
        const path = url.searchParams.get("path");

        if (!path) {
          return Response.json(
            { error: "Query parameter 'path' is required" },
            { status: 400 },
          );
        }

        const edgeWs = hubRegistry.getEdgeWs(edgeId);
        if (!edgeWs) {
          return Response.json(
            { error: `Edge ${edgeId} is not connected` },
            { status: 502 },
          );
        }

        const token = randomUUID();
        const browsePromise = hubRegistry.registerPendingBrowse(token);

        edgeWs.send(
          JSON.stringify({
            type: "browse",
            payload: { path, token },
          }),
        );

        try {
          const result = await browsePromise;
          return Response.json(result);
        } catch (err) {
          const message = (err as Error).message;
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    "/api/health": {
      GET: () => Response.json({ status: "ok", uptime: process.uptime() }),
    },

    // 让指定实例优雅退出
    "/api/instance/:id/shutdown": {
      POST: (req: BunRequest<"/api/instance/:id/shutdown">) => {
        const denied = authenticate(req);
        if (denied) return denied;
        const id = req.params.id;
        return (
          forwardToEdgeForHttp(id, {
            type: "shutdown",
            payload: { instanceId: id },
          }) ?? Response.json({ ok: true })
        );
      },
    },
  },

  // 兜底：静态文件服务 + SPA fallback
  async fetch(req) {
    const url = new URL(req.url);
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const resolvedPath = resolve(webDir, `.${filePath}`);

    // 防御路径遍历
    if (resolvedPath === webDir || resolvedPath.startsWith(webDir + sep)) {
      const file = Bun.file(resolvedPath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // SPA fallback
    return new Response(Bun.file(resolve(webDir, "index.html")));
  },

  // WebSocket 处理
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      if (ws.data.role === "browser") {
        hubRegistry.addBrowser(ws);
      }
      log.debug(`WebSocket opened: ${ws.data.role}`);
    },

    message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      const raw = typeof message === "string" ? message : message.toString();

      if (ws.data.role === "edge") {
        handleEdgeMessage(ws, raw);
      } else if (ws.data.role === "browser") {
        handleBrowserMessage(ws, raw);
      }
    },

    close(ws: ServerWebSocket<WsData>, code: number) {
      log.debug(`WebSocket closed: ${ws.data.role} (code: ${code})`);

      if (ws.data.role === "edge") {
        const edgeId = hubRegistry.findEdgeByWs(ws);
        if (edgeId) {
          hubRegistry.startEdgeGracePeriod(edgeId);
        }
      } else if (ws.data.role === "browser") {
        hubRegistry.removeBrowser(ws);
      }
    },
  },
});

log.info(`Hub server listening on http://${host}:${server.port}`);

// 优雅退出
async function shutdown(signal: string): Promise<never> {
  const t0 = Date.now();
  log.info(`Received ${signal}, shutting down...`);
  await server.stop(true);
  log.info(`server.stop(true) took ${Date.now() - t0}ms`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
