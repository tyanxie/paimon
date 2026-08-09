// 编译模式（全局安装）的更新：检测安装来源 → 委派对应包管理器
//
// 不做 rustup 式「下载二进制自替换」：paimon 走 esbuild 式平台包分发，
// npm/bun/pnpm 会按 optionalDependencies 解析出正确的平台包；
// 自替换会让包管理器元数据与磁盘文件脱节，且要自行处理校验、回滚等复杂度。

import { realpathSync, accessSync, constants } from "node:fs";
import pkg from "../../../../package.json";
import {
  detectGlobalInstall,
  getKnownGlobalDirs,
  buildUpdateCommand,
  type GlobalInstall,
} from "./detect";
import { runInherit, printDaemonHints } from "./utils";

const PACKAGE_NAME = pkg.name; // @tyanxie/paimon
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
/** pi 插件的安装源（与 README 中 `pi install npm:@tyanxie/paimon` 一致） */
const PI_EXTENSION_SOURCE = `npm:${PACKAGE_NAME}`;

/** 从 npm registry 获取最新版本号 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const resp = await fetch(NPM_REGISTRY_URL, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

/** 比较语义化版本：返回 true 表示 latest 比 current 更新 */
function isNewerVersion(current: string, latest: string): boolean {
  const parseSemver = (v: string) => v.split(".").map(Number);
  const [cMajor, cMinor, cPatch] = parseSemver(current);
  const [lMajor, lMinor, lPatch] = parseSemver(latest);
  if (lMajor !== cMajor) return lMajor > cMajor;
  if (lMinor !== cMinor) return lMinor > cMinor;
  return lPatch > cPatch;
}

/** 检测安装来源，失败则给出明确的手动更新指引并退出 */
function resolveInstall(): GlobalInstall {
  let execPath = process.execPath;
  try {
    execPath = realpathSync(execPath);
  } catch {
    // 保留原值继续尝试
  }

  const install = detectGlobalInstall(execPath, getKnownGlobalDirs());
  if (!install) {
    console.error(
      `Unable to determine how paimon was installed (${execPath}).`,
    );
    console.error("Please update manually with your package manager, e.g.:");
    console.error(`  npm install -g ${PACKAGE_NAME}@latest`);
    process.exit(1);
  }
  return install;
}

/** 安装失败后的补充提示：prefix 不可写通常意味着需要 sudo */
function printFailureHint(install: GlobalInstall, cmd: string[]): void {
  try {
    accessSync(install.prefix, constants.W_OK);
  } catch {
    console.error(
      `\n${install.prefix} is not writable. Try again with elevated privileges:`,
    );
    console.error(`  sudo ${cmd.join(" ")}`);
  }
}

/** 全局安装模式：检查并执行更新 */
export async function updateGlobalInstall(checkOnly: boolean): Promise<void> {
  const install = resolveInstall();

  // 查询最新版本
  console.log("Checking for updates...");
  const latest = await fetchLatestVersion();
  if (!latest) {
    console.error("Failed to fetch latest version from npm registry");
    process.exit(1);
  }

  if (!isNewerVersion(pkg.version, latest)) {
    console.log(`Already up to date (v${pkg.version})`);
    return;
  }

  console.log(`Current: v${pkg.version} → Latest: v${latest}`);
  console.log(`Installed via ${install.agent} at ${install.prefix}`);

  if (checkOnly) return;

  const command = buildUpdateCommand(install, `${PACKAGE_NAME}@${latest}`);
  if (!command) {
    console.error(`${install.agent} does not support global install`);
    process.exit(1);
  }

  console.log(`\n${command.cmd.join(" ")}`);
  if (!(await runInherit(command.cmd, { env: command.env }))) {
    console.error("\nUpdate failed");
    printFailureHint(install, command.cmd);
    process.exit(1);
  }

  console.log(`\n✅ Updated to v${latest}`);
  await printDaemonHints();
  console.log(
    `  Run 'pi update --extension ${PI_EXTENSION_SOURCE}' to update pi extension`,
  );
}
