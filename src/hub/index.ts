// Hub Server 入口：HTTP + WebSocket 服务

import type { ServerWebSocket } from "bun";
import { DEFAULTS } from "../protocol/types";
import { registry, type WsData } from "./registry";
import { handleExtensionMessage, handleBrowserMessage } from "./router";
import * as log from "./logger";

const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);

log.info(`Starting Hub server on port ${port}...`);

const server = Bun.serve<WsData>({
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

    // 静态文件（Web UI）— 生产环境从 dist/web 提供
    // 开发时由 Vite dev server 代理
    const webDir = new URL("../../dist/web", import.meta.url).pathname;
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`${webDir}${filePath}`);

    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback
    const indexFile = Bun.file(`${webDir}/index.html`);
    if (await indexFile.exists()) {
      return new Response(indexFile);
    }

    return new Response("Not Found", { status: 404 });
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
        const id = registry.findInstanceByWs(ws);
        if (id) {
          registry.unregister(id);
        }
      } else if (ws.data.role === "browser") {
        registry.removeBrowser(ws);
      }
    },
  },
});

log.info(`Hub server listening on http://localhost:${server.port}`);

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
