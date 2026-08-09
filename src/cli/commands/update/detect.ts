// 全局安装来源检测 —— 纯函数实现，便于测试
//
// 为什么不直接用 global-directory 的 npm.prefix：
// 该库的 npm prefix 兜底逻辑是 dirname(dirname(process.execPath))，前提是「运行在 node 里」。
// paimon 编译模式下 execPath 指向 paimon 二进制自身，推导结果完全错误
// （实测 nvm 环境下会得出 ~/.bun 而非 ~/.nvm/versions/node/vX）。
// 因此 npm / bun 的 prefix 一律从二进制真实所在的 node_modules 反推——
// 二进制躺在哪儿，哪儿就是真值，比 global-directory 和 `npm prefix -g` 都准。
// global-directory 只用于 yarn / pnpm 目录识别（这两者不依赖 execPath，
// 且它处理了 XDG / pnpm rc / darwin 的路径差异）。

import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import globalDirectory from "global-directory";
import { resolveCommand } from "package-manager-detector/commands";

/** 支持自更新的包管理器 */
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/** 检测到的全局安装信息 */
export interface GlobalInstall {
  agent: PackageManager;
  /** 全局安装前缀，用于显式指定，避免 PATH 上的 pm 与当初安装的 pm prefix 不一致 */
  prefix: string;
  /** 全局 node_modules 目录 */
  packagesDir: string;
}

/** 各包管理器的已知全局目录（可注入，便于测试） */
export interface KnownGlobalDirs {
  /** pnpm 全局根目录 <PNPM_HOME>/global，其下含 <N>/node_modules 与 <N>/.pnpm */
  pnpmGlobalRoot: string;
  pnpmPackages: string;
  pnpmPrefix: string;
  yarnPackages: string;
  yarnPrefix: string;
  bunPrefix: string;
}

/** bun 全局安装目录相对 BUN_INSTALL 的后缀 */
const BUN_GLOBAL_SUFFIX = "install/global/node_modules";
/** npm 全局安装目录相对 prefix 的后缀（POSIX） */
const NPM_GLOBAL_SUFFIX = "lib/node_modules";

/** 读取当前环境下各包管理器的全局目录 */
export function getKnownGlobalDirs(
  env: Record<string, string | undefined> = process.env,
): KnownGlobalDirs {
  return {
    // globalDirectory.pnpm.packages = <global>/<N>/node_modules，上溯两级得全局根目录，
    // 这样不依赖 pnpm 的目录版本号（当前为 5，未来可能变化）
    pnpmGlobalRoot: dirname(dirname(globalDirectory.pnpm.packages)),
    pnpmPackages: globalDirectory.pnpm.packages,
    pnpmPrefix: globalDirectory.pnpm.prefix,
    yarnPackages: globalDirectory.yarn.packages,
    // yarn classic 的 --prefix 对应 <prefix>/bin
    yarnPrefix: dirname(globalDirectory.yarn.binaries),
    bunPrefix: env.BUN_INSTALL ?? resolve(homedir(), ".bun"),
  };
}

/** 判断 child 是否等于 parent 或位于其内部 */
function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/** 按目录形态判定某个 node_modules 属于哪个包管理器 */
function classify(
  packagesDir: string,
  dirs: KnownGlobalDirs,
): GlobalInstall | null {
  if (isInside(packagesDir, dirs.yarnPackages)) {
    return { agent: "yarn", prefix: dirs.yarnPrefix, packagesDir };
  }
  if (packagesDir.endsWith(`/${BUN_GLOBAL_SUFFIX}`)) {
    return {
      agent: "bun",
      prefix: packagesDir.slice(0, -(BUN_GLOBAL_SUFFIX.length + 1)),
      packagesDir,
    };
  }
  if (packagesDir.endsWith(`/${NPM_GLOBAL_SUFFIX}`)) {
    return {
      agent: "npm",
      prefix: packagesDir.slice(0, -(NPM_GLOBAL_SUFFIX.length + 1)),
      packagesDir,
    };
  }
  return null;
}

/**
 * 从二进制路径反查全局安装来源。
 *
 * @param execPath 二进制真实路径（调用方需先 realpath）
 */
export function detectGlobalInstall(
  execPath: string,
  dirs: KnownGlobalDirs,
): GlobalInstall | null {
  // pnpm 必须先于 node_modules 反查处理：它的实包存放在与 node_modules 同级的
  // .pnpm 虚拟目录下（<global>/<N>/.pnpm/<pkg>/node_modules/...），
  // 从二进制向上找到的 node_modules 并不是全局安装目录，只能靠全局根目录判定。
  if (isInside(execPath, dirs.pnpmGlobalRoot)) {
    return {
      agent: "pnpm",
      prefix: dirs.pnpmPrefix,
      packagesDir: dirs.pnpmPackages,
    };
  }

  // 其余包管理器为扁平布局，从外向内逐层匹配 node_modules
  const segments = execPath.split("/");
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] !== "node_modules") continue;
    const result = classify(segments.slice(0, i + 1).join("/"), dirs);
    if (result) return result;
  }
  return null;
}

/** 更新命令（含需要注入的环境变量） */
export interface UpdateCommand {
  cmd: string[];
  env: Record<string, string>;
}

/**
 * 构造全局更新命令。
 *
 * 基础 argv 交给 package-manager-detector 生成（它跟随各 pm 演进，
 * 例如 yarn berry 已移除 global install，其 global 命令实际回落到 npm），
 * 再按 agent 追加显式 prefix，避免装到另一个 prefix 去。
 */
export function buildUpdateCommand(
  install: GlobalInstall,
  spec: string,
): UpdateCommand | null {
  const resolved = resolveCommand(install.agent, "global", [spec]);
  if (!resolved) return null;

  const cmd = [resolved.command, ...resolved.args];
  const env: Record<string, string> = {};

  switch (install.agent) {
    case "npm":
    case "yarn":
      cmd.push("--prefix", install.prefix);
      break;
    case "pnpm":
      env.PNPM_HOME = install.prefix;
      break;
    case "bun":
      env.BUN_INSTALL = install.prefix;
      break;
  }

  return { cmd, env };
}
