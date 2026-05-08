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

  // Fork Hub 进程
  const hubEntry = resolve(import.meta.dirname!, "../hub/index.ts");
  const child = Bun.spawn(["bun", "run", hubEntry], {
    env: { ...process.env, PAIMON_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    // 分离子进程，使其独立于父进程
    ipc: undefined,
  });

  // 等待一小段时间确认启动成功
  await Bun.sleep(500);

  if (child.exitCode !== null) {
    // 进程已退出，说明启动失败
    const stderr = await new Response(child.stderr).text();
    console.error(`Failed to start Hub: ${stderr}`);
    process.exit(1);
  }

  // 写入 PID 和端口
  await writePid(child.pid);
  await writePort(port);

  // 将子进程的输出重定向到日志文件
  // 使用 unref() 让父进程可以退出
  const logFile = Bun.file(logPath);
  const writer = logFile.writer();

  // 异步读取子进程输出写入日志
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (stdout) {
    const reader1 = stdout.getReader();
    (async () => {
      while (true) {
        const { done, value } = await reader1.read();
        if (done) break;
        writer.write(value);
      }
      writer.end();
    })();
  }
  if (stderr) {
    const reader2 = stderr.getReader();
    (async () => {
      while (true) {
        const { done, value } = await reader2.read();
        if (done) break;
        writer.write(value);
      }
    })();
  }

  // 让父进程退出（子进程继续运行）
  child.unref();

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
