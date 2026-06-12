// paimon edge —— Edge 管理命令组

import { hostname } from "node:os";
import type { Command } from "@commander-js/extra-typings";
import { DEFAULTS } from "../../../protocol/types";

export function registerEdgeCommand(program: Command): void {
  const edge = program.command("edge").description("Manage Edge daemon");

  edge
    .command("start")
    .description("Start Edge daemon")
    .option("--port <port>", "listen port", String(DEFAULTS.EDGE_PORT))
    .option("--host <host>", "bind address", DEFAULTS.EDGE_HOST)
    .option("--edge-id <id>", "edge identifier", hostname())
    .option("--hub <url>", "Hub WebSocket URL", DEFAULTS.EDGE_HUB_URL)
    .action(async (opts) => {
      const { handleEdgeStart } = await import("./start");
      await handleEdgeStart(
        parseInt(opts.port),
        opts.host,
        opts.edgeId,
        opts.hub,
      );
    });

  edge
    .command("stop")
    .description("Stop Edge daemon")
    .action(async () => {
      const { handleEdgeStop } = await import("./stop");
      await handleEdgeStop();
    });

  edge
    .command("restart")
    .description("Restart Edge daemon")
    .option("--port <port>", "listen port")
    .option("--host <host>", "bind address")
    .option("--edge-id <id>", "edge identifier")
    .option("--hub <url>", "Hub WebSocket URL")
    .action(async (opts) => {
      const { handleEdgeRestart } = await import("./restart");
      await handleEdgeRestart(
        opts.port ? parseInt(opts.port) : undefined,
        opts.host,
        opts.edgeId,
        opts.hub,
      );
    });

  edge
    .command("status")
    .description("Show Edge status")
    .action(async () => {
      const { handleEdgeStatus } = await import("./status");
      await handleEdgeStatus();
    });

  edge
    .command("logs")
    .description("View Edge logs")
    .option("-f, --follow", "follow log output")
    .action(async (opts) => {
      const { handleEdgeLogs } = await import("./logs");
      await handleEdgeLogs(opts.follow ?? false);
    });
}
