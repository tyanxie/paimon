// update 命令的共享工具

import { getDaemonStatus } from "../../daemon";
import { getEdgeDaemonStatus } from "../../edge-daemon";

/** 子进程执行选项 */
export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
}

/** 运行命令并捕获输出 */
export async function run(
  cmd: string[],
  options?: RunOptions,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

/**
 * 运行命令并将 stdio 直接透传到终端。
 * stdin 也需要 inherit：git pull 可能要求输入凭证，
 * 全局安装到 /usr/local 时 sudo 可能要求输入密码。
 */
export async function runInherit(
  cmd: string[],
  options?: RunOptions,
): Promise<boolean> {
  const proc = Bun.spawn(cmd, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : undefined,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  return exitCode === 0;
}

/** 检查 Hub/Edge 运行状态并输出重启提示 */
export async function printDaemonHints(): Promise<void> {
  const [hub, edge] = await Promise.all([
    getDaemonStatus(),
    getEdgeDaemonStatus(),
  ]);

  if (hub.running) {
    console.log("  Run 'paimon hub restart' to apply updates to Hub");
  }
  if (edge.running) {
    console.log("  Run 'paimon edge restart' to apply updates to Edge");
  }
}
