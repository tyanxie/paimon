// Hub Server 入口：HTTP + WebSocket + 静态文件服务

import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { ServerWebSocket, Server, BunRequest } from "bun";
import { DEFAULTS } from "../protocol/types";
import { isLoopbackHost, nonLoopbackWarning } from "../utils/host";
import { registry, type WsData } from "./registry";
import { handleExtensionMessage, handleBrowserMessage } from "./router";
import { forwardToInstanceForHttp } from "./forward";
import { spawnInstance, validateCwd } from "./spawner";
import * as log from "./logger";

const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);
// bind 地址：默认 loopback，与 port 一致走 PAIMON_HOST 环境变量（CLI --host / dev 环境变量注入）
const host = process.env.PAIMON_HOST || DEFAULTS.HOST;

// 静态文件目录：相对于项目根 dist/web
const webDir = resolve(import.meta.dir, "../../dist/web");

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
 * 升级 WebSocket 连接，并附加 per-connection 上下文数据。
 * 成功返回 undefined（连接已交给 websocket handler），失败返回 400。
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

// 非 loopback bind 时警告（页面可创建具全部系统权限的 pi 实例）
if (!isLoopbackHost(host)) {
  log.warn(nonLoopbackWarning(host));
}

const server = Bun.serve<WsData>({
  hostname: host,
  port,

  routes: {
    // ── WebSocket 升级端点 ──
    // /ws/extension：每个 pi 实例的 paimon extension 连接（注册 + 上报事件）
    "/ws/extension": (req: Request, server: Server<WsData>) =>
      upgradeWs(req, server, { role: "extension" }),
    // /ws/browser：Web 控制面板连接（订阅实例 + 下发指令）
    "/ws/browser": (req: Request, server: Server<WsData>) =>
      upgradeWs(req, server, { role: "browser", subscriptions: new Set() }),

    // ── JSON API ──
    "/api/instances": {
      GET: () => Response.json({ instances: registry.getAllInstances() }),
      // 在指定目录 spawn 一个 headless pi 实例，等注册成功后返回 instanceId
      POST: async (req: Request) => {
        let body: { cwd?: string };
        try {
          body = (await req.json()) as { cwd?: string };
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const cwd = body.cwd?.trim() ?? "";
        const invalid = validateCwd(cwd);
        if (invalid) {
          return Response.json({ error: invalid }, { status: 400 });
        }
        try {
          const instanceId = await spawnInstance(cwd);
          return Response.json({ instanceId });
        } catch (err) {
          const message = (err as Error).message;
          log.error(`Failed to spawn instance: ${message}`);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    "/api/health": {
      GET: () => Response.json({ status: "ok", uptime: process.uptime() }),
    },

    // 让指定实例优雅退出（供 CLI attach 接管前关闭原实例）
    "/api/instance/:id/shutdown": {
      POST: (req: BunRequest<"/api/instance/:id/shutdown">) => {
        const id = req.params.id;
        return (
          forwardToInstanceForHttp(id, { type: "shutdown" }) ??
          Response.json({ ok: true })
        );
      },
    },
  },

  // 兜底：静态文件服务 + SPA fallback
  async fetch(req) {
    const url = new URL(req.url);
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const resolvedPath = resolve(webDir, `.${filePath}`);

    // 防御路径遍历：解析后的路径必须仍在 webDir 内，否则回退 SPA
    if (resolvedPath === webDir || resolvedPath.startsWith(webDir + sep)) {
      const file = Bun.file(resolvedPath);
      if (await file.exists()) {
        return new Response(file);
      }
    }

    // SPA fallback：未匹配到静态文件（或路径越界）时返回 index.html
    return new Response(Bun.file(resolve(webDir, "index.html")));
  },

  // WebSocket 处理
  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      if (ws.data.role === "browser") {
        registry.addBrowser(ws);
      }
      log.debug(`WebSocket opened: ${ws.data.role}`);
    },

    message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
      const raw = typeof message === "string" ? message : message.toString();

      if (ws.data.role === "extension") {
        handleExtensionMessage(ws, raw);
      } else if (ws.data.role === "browser") {
        handleBrowserMessage(ws, raw);
      }
    },

    close(ws: ServerWebSocket<WsData>, code: number) {
      log.debug(`WebSocket closed: ${ws.data.role} (code: ${code})`);

      if (ws.data.role === "extension") {
        const id = ws.data.instanceId;
        if (id) {
          // 只有当这个 ws 仍是活跃连接时才启动 grace period，避免旧 ws 的 close 干扰新连接
          const activeWs = registry.getInstanceWs(id);
          if (activeWs === ws || activeWs === undefined) {
            registry.startGracePeriod(id);
          }
        }
      } else if (ws.data.role === "browser") {
        registry.removeBrowser(ws);
      }
    },
  },
});

log.info(`Hub server listening on http://${host}:${server.port}`);

// 优雅退出：立即关闭所有活跃连接（WebSocket 长连接不会自然结束，
// extension/browser 均有重连机制，无需等待 drain）
async function shutdown(signal: string): Promise<never> {
  const t0 = Date.now();
  log.info(`Received ${signal}, shutting down...`);
  await server.stop(true);
  log.info(`server.stop(true) took ${Date.now() - t0}ms`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
