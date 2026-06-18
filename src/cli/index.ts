#!/usr/bin/env bun
// CLI 入口：基于 Commander 的命令注册与解析
//
// 编译为单文件二进制后，daemon 通过 PAIMON_ROLE 环境变量区分角色：
//   PAIMON_ROLE=hub  → 直接运行 Hub server
//   PAIMON_ROLE=edge → 直接运行 Edge server
//   其他             → 正常 CLI 命令解析

const role = process.env.PAIMON_ROLE;

if (role === "hub") {
  await import("../hub/index");
} else if (role === "edge") {
  await import("../edge/index");
} else {
  const { program } = await import("@commander-js/extra-typings");
  const { registerHubCommand } = await import("./commands/hub");
  const { registerEdgeCommand } = await import("./commands/edge");
  const { registerAttachCommand } = await import("./commands/attach");
  const pkg = (await import("../../package.json")).default;

  program
    .name("paimon")
    .description("Remote observation and control panel for pi coding agent")
    .version(pkg.version);

  registerHubCommand(program);
  registerEdgeCommand(program);
  registerAttachCommand(program);

  program.parse();
}

export {};
