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
    .option("--token <token>", "access token (default: auto-generate)")
    .action(async (opts) => {
      const { handleStart } = await import("./start");
      await handleStart(parseInt(opts.port), opts.host, opts.token);
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
    .option("--token <token>", "access token (default: auto-generate)")
    .action(async (opts) => {
      const { handleRestart } = await import("./restart");
      await handleRestart(
        opts.port ? parseInt(opts.port) : undefined,
        opts.host,
        opts.token,
      );
    });

  hub
    .command("status")
    .description("Show Hub status")
    .action(async () => {
      const { handleStatus } = await import("./status");
      await handleStatus();
    });
}
