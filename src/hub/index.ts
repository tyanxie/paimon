// Hub Server 入口：HTTP + WebSocket + 静态文件服务
//
// Hub 只与 Edge 和 Browser 通信，不再直接连接 pi extension。
// Edge 通过 /ws/edge 连接 Hub，Browser 通过 /ws/browser 连接。
// 所有路由统一在 fetch 中处理，支持 basePath prefix strip（直接访问和反向代理均可工作）。

import { existsSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import type { ServerWebSocket, Server } from "bun";
import { randomUUID } from "node:crypto";
import { DEFAULTS } from "../protocol/types";
import { isLoopbackHost, nonLoopbackWarning, isCompiled } from "../utils/env";
import { normalizeBasePath } from "../utils/basePath";
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

// 路由匹配正则
const RE_BROWSE = /^\/api\/edges\/([^/]+)\/browse$/;
const RE_SHUTDOWN = /^\/api\/instance\/([^/]+)\/shutdown$/;

const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);
const host = process.env.PAIMON_HOST || DEFAULTS.HOST;
const accessToken = process.env.PAIMON_ACCESS_TOKEN || "";
const authEnabled = !isAuthDisabled() && accessToken.length > 0;

// Base path：用于子路径部署（如 /paimon），前端运行时通过注入的全局变量获取
// 运行时统一为 ""（根路径）或 "/paimon"（子路径），与前端 BASE_PATH 语义一致
let basePath: string;
try {
  basePath = normalizeBasePath(process.env.PAIMON_BASE_PATH) ?? "";
} catch (err) {
  log.error((err as Error).message);
  process.exit(1);
}

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

// 预读并注入 basePath 的 index.html（运行时注入，无需重新构建前端）
const rawIndexHtml = await Bun.file(resolve(webDir, "index.html")).text();
// 注入 <base href> 让相对路径资源基于 basePath 解析，
// 注入 __BASE_PATH__ 让前端 JS 知道当前部署前缀
const injectedHead = [
  "<head>",
  `<base href="${basePath}/">`,
  `<script>window.__BASE_PATH__=${JSON.stringify(basePath)}</script>`,
].join("");
const indexHtml = rawIndexHtml.replace("<head>", injectedHead);

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

/**
 * Strip basePath 前缀：如果路径以 basePath 开头则移除，否则保持原样。
 * 兼容两种场景：反向代理已 strip（路径不带前缀）/ 直接访问（路径带前缀）。
 */
function stripBasePath(pathname: string): string {
  if (basePath) {
    if (pathname === basePath) return "/";
    if (pathname.startsWith(basePath + "/")) {
      return pathname.slice(basePath.length);
    }
  }
  return pathname;
}

log.info(`Starting Hub server on ${host}:${port}...`);
if (basePath) {
  log.info(`Base path: ${basePath}`);
}
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

  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;
    const pathname = stripBasePath(url.pathname);

    // ── WebSocket 升级端点 ──
    if (pathname === "/ws/edge") {
      const denied = authenticate(req);
      if (denied) return denied;
      return upgradeWs(req, server, { role: "edge" } as EdgeWsData);
    }

    if (pathname === "/ws/browser") {
      const denied = authenticate(req);
      if (denied) return denied;
      return upgradeWs(req, server, {
        role: "browser",
        subscriptions: new Set(),
      } as BrowserWsData);
    }

    // ── JSON API ──
    if (pathname === "/api/health" && method === "GET") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }

    if (pathname === "/api/instances" && method === "GET") {
      const denied = authenticate(req);
      if (denied) return denied;
      return Response.json({ instances: hubRegistry.getAllInstances() });
    }

    if (pathname === "/api/instances" && method === "POST") {
      const denied = authenticate(req);
      if (denied) return denied;
      return handleSpawnInstance(req);
    }

    if (pathname === "/api/edges" && method === "GET") {
      const denied = authenticate(req);
      if (denied) return denied;
      return Response.json({ edges: hubRegistry.getAllEdges() });
    }

    // /api/edges/:edgeId/browse
    const browseMatch = pathname.match(RE_BROWSE);
    if (browseMatch && method === "GET") {
      const denied = authenticate(req);
      if (denied) return denied;
      return handleBrowse(url.searchParams, decodeURIComponent(browseMatch[1]));
    }

    // /api/instance/:id/shutdown
    const shutdownMatch = pathname.match(RE_SHUTDOWN);
    if (shutdownMatch && method === "POST") {
      const denied = authenticate(req);
      if (denied) return denied;
      const id = decodeURIComponent(shutdownMatch[1]);
      return (
        forwardToEdgeForHttp(id, {
          type: "shutdown",
          payload: { instanceId: id },
        }) ?? Response.json({ ok: true })
      );
    }

    // ── 静态文件服务 + SPA fallback ──
    const filePath = pathname === "/" ? "/index.html" : pathname;
    const resolvedPath = resolve(webDir, `.${filePath}`);

    // 防御路径遍历
    if (resolvedPath === webDir || resolvedPath.startsWith(webDir + sep)) {
      // index.html 返回注入了 basePath 的版本
      if (filePath === "/index.html") {
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      const file = Bun.file(resolvedPath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // SPA fallback：返回注入了 basePath 的 index.html
    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
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

// ── API handler 函数 ──

async function handleSpawnInstance(req: Request): Promise<Response> {
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
}

async function handleBrowse(
  searchParams: URLSearchParams,
  edgeId: string,
): Promise<Response> {
  const path = searchParams.get("path");

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
}

log.info(`Hub server listening on http://${host}:${server.port}`);

// 优雅退出
async function shutdown(signal: string): Promise<never> {
  const t0 = Date.now();
  log.info(`Received ${signal}, shutting down...`);
  await server.stop(true);
  log.info(`server.stop(true) took ${Date.now() - t0}ms`);
  await log.shutdown();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
