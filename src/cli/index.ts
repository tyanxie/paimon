#!/usr/bin/env bun
// CLI 入口：基于 Commander 的命令注册与解析

import { program } from "@commander-js/extra-typings";
import { registerHubCommand } from "./commands/hub";
import { registerEdgeCommand } from "./commands/edge";
import { registerAttachCommand } from "./commands/attach";
import pkg from "../../package.json";

program
  .name("paimon")
  .description("Remote observation and control panel for pi coding agent")
  .version(pkg.version);

registerHubCommand(program);
registerEdgeCommand(program);
registerAttachCommand(program);

program.parse();
