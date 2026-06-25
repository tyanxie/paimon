// 运行时环境与共享常量

import { resolve } from "node:path";
import { homedir } from "node:os";

/** 当前是否运行在 bun --compile 编译的单文件二进制中 */
export const isCompiled = import.meta.path.startsWith("/$bunfs/");

/** 状态根目录 ~/.paimon */
export const STATE_DIR = resolve(homedir(), ".paimon");

/** host 是否为 loopback（127.0.0.1 / localhost / ::1） */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** 非 loopback host 警告文案（英文，无 emoji） */
export function nonLoopbackWarning(host: string): string {
  return (
    `WARNING: Hub bound to ${host} (non-loopback). The web panel can spawn pi\n` +
    `instances with full system access. Only use this on trusted networks.`
  );
}
