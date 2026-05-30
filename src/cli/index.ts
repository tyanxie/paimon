#!/usr/bin/env bun
// CLI 入口：paimon 命令路由

import { hubCommand } from "./hub";
import { attachCommand } from "./attach";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "hub":
    await hubCommand(args);
    break;
  case "attach":
    await attachCommand(args);
    break;
  case undefined:
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
paimon - Remote observation and control panel for pi coding agent

Usage:
  paimon hub start [--port 8080]    Start Hub daemon
  paimon hub stop                   Stop Hub
  paimon hub status                 Show Hub status
  paimon hub logs [--follow]        View Hub logs
  paimon attach [id]                Attach a local instance to this terminal

Options:
  -h, --help    Show this help
`);
}
