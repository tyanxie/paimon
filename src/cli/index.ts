#!/usr/bin/env bun
// CLI 入口：paimon 命令路由

import { hubCommand } from "./hub";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "hub":
    await hubCommand(args);
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
  paimon hub start [--port 7890]    Start Hub daemon
  paimon hub stop                   Stop Hub
  paimon hub status                 Show Hub status
  paimon hub logs [--follow]        View Hub logs

Options:
  -h, --help    Show this help
`);
}
