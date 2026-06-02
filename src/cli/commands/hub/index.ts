// paimon hub —— Hub 管理命令组

import type { Command } from "@commander-js/extra-typings";
import { DEFAULTS } from "../../../protocol/types";

export function registerHubCommand(program: Command): void {
  const hub = program.command("hub").description("Manage Hub daemon");

  hub
    .command("start")
    .description("Start Hub daemon")
    .option("--port <port>", "port number", String(DEFAULTS.PORT))
    .option("--host <host>", "bind address", DEFAULTS.HOST)
    .action(async (opts) => {
      const { handleStart } = await import("./start");
      await handleStart(parseInt(opts.port), opts.host);
    });

  hub
    .command("stop")
    .description("Stop Hub daemon")
    .action(async () => {
      const { handleStop } = await import("./stop");
      await handleStop();
    });

  hub
    .command("restart")
    .description("Restart Hub daemon")
    .option("--port <port>", "port number")
    .option("--host <host>", "bind address")
    .action(async (opts) => {
      const { handleRestart } = await import("./restart");
      await handleRestart(
        opts.port ? parseInt(opts.port) : undefined,
        opts.host,
      );
    });

  hub
    .command("status")
    .description("Show Hub status")
    .action(async () => {
      const { handleStatus } = await import("./status");
      await handleStatus();
    });

  hub
    .command("logs")
    .description("View Hub logs")
    .option("-f, --follow", "follow log output")
    .action(async (opts) => {
      const { handleLogs } = await import("./logs");
      await handleLogs(opts.follow ?? false);
    });
}
