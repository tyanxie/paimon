// Hub Server 入口：HTTP + WebSocket + 静态文件服务

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import { DEFAULTS } from "../protocol/types";
import { registry, type WsData } from "./registry";
import { handleExtensionMessage, handleBrowserMessage } from "./router";
import * as log from "./logger";

const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);

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

log.info(`Starting Hub server on port ${port}...`);

const server = Bun.serve<WsData>({
  hostname: "0.0.0.0",
  port,
  // HTTP 请求处理
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket 升级
    if (url.pathname === "/ws/extension") {
      const upgraded = server.upgrade(req, {
        data: { role: "extension" as const },
      });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    if (url.pathname === "/ws/browser") {
      const upgraded = server.upgrade(req, {
        data: { role: "browser" as const, subscriptions: new Set() },
      });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // API: 实例列表
    if (url.pathname === "/api/instances") {
      return Response.json({
        instances: registry.getAllInstances(),
      });
    }

    // API: 健康检查
    if (url.pathname === "/api/health") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }

    // 静态文件服务
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(resolve(webDir, `.${filePath}`));

    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback
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

    close(ws: ServerWebSocket<WsData>, code: number, reason: string) {
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

log.info(`Hub server listening on http://0.0.0.0:${server.port}`);

// 优雅退出
process.on("SIGTERM", () => {
  log.info("Received SIGTERM, shutting down...");
  server.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  log.info("Received SIGINT, shutting down...");
  server.stop();
  process.exit(0);
});
