// paimon update —— 自更新命令
//
// 两种安装模式：
//   源码模式（bun link）：git pull + bun install + bun run build
//   编译模式（全局安装）：检测 npm/pnpm/yarn/bun 来源后委派对应包管理器

import type { Command } from "@commander-js/extra-typings";
import { isCompiled } from "../../../utils/env";
import { updateFromSource } from "./source";
import { updateGlobalInstall } from "./global";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("update paimon to the latest version")
    .option("--check", "check for updates without installing")
    .action(async (options) => {
      const checkOnly = options.check ?? false;

      if (isCompiled) {
        await updateGlobalInstall(checkOnly);
      } else {
        await updateFromSource(checkOnly);
      }
    });
}
