// paimon version —— 版本信息

import type { Command } from "@commander-js/extra-typings";
import pkg from "../../../../package.json";

/** 返回格式化的版本字符串 */
export function version(): string {
  return `${pkg.name} v${pkg.version}`;
}

export function registerVersionCommand(program: Command): void {
  program
    .command("version")
    .description("output the version number")
    .action(() => {
      console.log(version());
    });
}
