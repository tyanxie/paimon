// Daemon 进程管理：启动/停止/状态查询

import { resolve, join } from "path";
import { homedir } from "os";
import { DEFAULTS } from "../protocol/types";

/** 状态目录，展开 ~ */
const STATE_DIR = resolve(homedir(), ".paimon");

/** 获取状态文件路径 */
export function getStatePath(filename: string): string {
  return join(STATE_DIR, filename);
}

/** 确保状态目录存在 */
async function ensureStateDir(): Promise<void> {
  const { mkdir } = await import("fs/promises");
  await mkdir(STATE_DIR, { recursive: true });
}

/** 读取 PID 文件，返回 PID 或 null */
export async function readPid(): Promise<number | null> {
  try {
    const content = await Bun.file(getStatePath(DEFAULTS.PID_FILE)).text();
    const pid = parseInt(content.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** 写入 PID 文件 */
async function writePid(pid: number): Promise<void> {
  await ensureStateDir();
  await Bun.write(getStatePath(DEFAULTS.PID_FILE), String(pid));
}

/** 写入端口文件 */
async function writePort(port: number): Promise<void> {
  await ensureStateDir();
  await Bun.write(getStatePath(DEFAULTS.PORT_FILE), String(port));
}

/** 删除状态文件 */
async function cleanStateFiles(): Promise<void> {
  const { unlink } = await import("fs/promises");
  const files = [DEFAULTS.PID_FILE, DEFAULTS.PORT_FILE];
  for (const f of files) {
    try {
      await unlink(getStatePath(f));
    } catch {
      // 文件不存在忽略
    }
  }
}

/** 检查进程是否存活 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 读取端口 */
export async function readPort(): Promise<number | null> {
  try {
    const content = await Bun.file(getStatePath(DEFAULTS.PORT_FILE)).text();
    const port = parseInt(content.trim(), 10);
    return isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

/** 读取日志文件尾部若干行，用于启动失败时输出诊断信息 */
async function readLogTail(logPath: string, lines = 20): Promise<string> {
  try {
    const content = await Bun.file(logPath).text();
    return content.split("\n").slice(-lines).join("\n").trim();
  } catch {
    return "(no log output)";
  }
}

/** 启动 Hub daemon */
export async function startDaemon(port: number): Promise<void> {
  // 检查是否已在运行
  const existingPid = await readPid();
  if (existingPid && isProcessAlive(existingPid)) {
    const existingPort = await readPort();
    console.log(
      `Hub is already running (PID: ${existingPid}, port: ${existingPort ?? "unknown"})`,
    );
    return;
  }

  await ensureStateDir();
  const logPath = getStatePath(DEFAULTS.LOG_FILE);

  // 以 append 模式打开日志文件，拿到原始 fd 直接交给子进程。
  // 子进程的 stdout/stderr 由内核写入该 fd，父进程完全不参与转发，
  // 因此父进程没有任何 pending IO，配合 detached + unref 可立即退出。
  const { openSync } = await import("node:fs");
  const logFd = openSync(logPath, "a");

  // Fork Hub 进程
  const hubEntry = resolve(import.meta.dirname!, "../hub/index.ts");
  const child = Bun.spawn(["bun", "run", hubEntry], {
    env: { ...process.env, PAIMON_PORT: String(port) },
    stdin: "ignore",
    // 直接写日志文件 fd，捕获包括运行时崩溃在内的全部输出
    stdout: logFd,
    stderr: logFd,
    // detached: POSIX 下调用 setsid()，子进程成为新 session leader，
    // 脱离父进程的终端/进程组，可独立存活并独立接收信号
    detached: true,
  });

  // unref 让父进程不再等待子进程退出
  child.unref();

  // 轮询健康检查确认启动成功（替代不可靠的固定 sleep）
  let ok = false;
  for (let i = 0; i < 50; i++) {
    // 进程已退出说明启动失败
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) {
        ok = true;
        break;
      }
    } catch {
      // 尚未就绪，继续轮询
    }
    await Bun.sleep(100);
  }

  if (!ok) {
    const tail = await readLogTail(logPath);
    console.error(`Failed to start Hub. Recent logs:\n${tail}`);
    process.exit(1);
  }

  // 写入 PID 和端口
  await writePid(child.pid);
  await writePort(port);

  console.log(`Hub started (PID: ${child.pid}, port: ${port})`);
  console.log(`  Web UI: http://localhost:${port}`);
  console.log(`  Logs:   ${logPath}`);
}

/** 停止 Hub daemon */
export async function stopDaemon(): Promise<void> {
  const pid = await readPid();
  if (!pid) {
    console.log("Hub is not running (no PID file)");
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log("Hub is not running (stale PID file, cleaning up)");
    await cleanStateFiles();
    return;
  }

  // 发送 SIGTERM
  process.kill(pid, "SIGTERM");
  console.log(`Stopping Hub (PID: ${pid})...`);

  // 等待进程退出（最多 5s）
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await Bun.sleep(200);
  }

  if (isProcessAlive(pid)) {
    // 强制杀死
    process.kill(pid, "SIGKILL");
    console.log("Hub killed (SIGKILL)");
  } else {
    console.log("Hub stopped");
  }

  await cleanStateFiles();
}

/** 获取 Hub 状态 */
export async function getDaemonStatus(): Promise<{
  running: boolean;
  pid?: number;
  port?: number;
}> {
  const pid = await readPid();
  if (!pid || !isProcessAlive(pid)) {
    return { running: false };
  }
  const port = (await readPort()) ?? undefined;
  return { running: true, pid, port };
}
