// Daemon 进程管理：启动/停止/状态查询

import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { mkdir, unlink, rename } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { DEFAULTS } from "../protocol/types";
import type { HubState } from "../protocol/types";
import { isLoopbackHost, nonLoopbackWarning } from "../utils/host";
import { generateAccessToken } from "../hub/auth";

/** 状态目录，展开 ~ */
const STATE_DIR = resolve(homedir(), ".paimon");

/** 获取状态文件路径 */
export function getStatePath(filename: string): string {
  return join(STATE_DIR, filename);
}

/** 确保状态目录存在 */
async function ensureStateDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

/** 读取 Hub 状态文件，返回 HubState 或 null */
export async function readHubState(): Promise<HubState | null> {
  try {
    const content = await Bun.file(getStatePath(DEFAULTS.STATE_FILE)).text();
    const state = JSON.parse(content) as HubState;
    // 基本字段校验
    if (!state.pid || !state.port || !state.host) return null;
    return state;
  } catch {
    return null;
  }
}

/** 原子写入 Hub 状态文件（write-tmp + rename） */
async function writeHubState(state: HubState): Promise<void> {
  await ensureStateDir();
  const target = getStatePath(DEFAULTS.STATE_FILE);
  const tmp = `${target}.tmp`;
  await Bun.write(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, target);
}

/** 删除状态文件 */
async function cleanStateFile(): Promise<void> {
  try {
    await unlink(getStatePath(DEFAULTS.STATE_FILE));
  } catch {
    // 文件不存在忽略
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

/** 读取日志文件尾部若干行，用于启动失败时输出诊断信息 */
async function readLogTail(logPath: string, lines = 20): Promise<string> {
  try {
    const content = await Bun.file(logPath).text();
    return content.split("\n").slice(-lines).join("\n").trim();
  } catch {
    return "(no log output)";
  }
}

/** Token 来源描述 */
type TokenSource = "env" | "--token" | "inherited" | "auto-generated";

/** Token 参数：带来源信息的 token */
export interface TokenOption {
  token: string;
  source: TokenSource;
}

/** 确定 access token：环境变量 > 显式传入 > 自动生成 */
function resolveAccessToken(option?: TokenOption): {
  token: string;
  source: TokenSource;
} {
  const envToken = process.env.PAIMON_ACCESS_TOKEN;
  if (envToken) return { token: envToken, source: "env" };
  if (option) return option;
  return { token: generateAccessToken(), source: "auto-generated" };
}

/** 启动 Hub daemon */
export async function startDaemon(
  port: number,
  host: string,
  tokenOption?: TokenOption,
): Promise<void> {
  // 检查是否已在运行
  const existing = await readHubState();
  if (existing && isProcessAlive(existing.pid)) {
    console.log(
      `Hub is already running (PID: ${existing.pid}, port: ${existing.port})`,
    );
    return;
  }

  // 进程已不存活，清理可能残留的 stale 状态文件，避免启动失败时误报运行中
  await cleanStateFile();

  await ensureStateDir();
  const logPath = getStatePath(DEFAULTS.LOG_FILE);

  // 以 append 模式打开日志文件，拿到原始 fd 直接交给子进程。
  // 子进程的 stdout/stderr 由内核写入该 fd，父进程完全不参与转发，
  // 因此父进程没有任何 pending IO，配合 detached + unref 可立即退出。
  const logFd = openSync(logPath, "a");

  // 确定 access token
  const { token: accessToken, source: tokenSource } =
    resolveAccessToken(tokenOption);

  // Fork Hub 进程
  const hubEntry = resolve(import.meta.dirname!, "../hub/index.ts");
  const child = Bun.spawn(["bun", "run", hubEntry], {
    env: {
      ...process.env,
      PAIMON_PORT: String(port),
      PAIMON_HOST: host,
      PAIMON_ACCESS_TOKEN: accessToken,
    },
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

  // 子进程已继承独立的 fd 副本，父进程侧的副本可立即关闭，避免 fd 泄漏
  closeSync(logFd);

  // 轮询健康检查确认启动成功（替代不可靠的固定 sleep）
  // 健康检查地址需依 host 推导：0.0.0.0 / loopback 走 127.0.0.1；
  // 绑定到具体 IP（如 192.168.1.5）时服务不监听 loopback，须打该 IP
  const healthHost =
    host === "0.0.0.0" || isLoopbackHost(host) ? "127.0.0.1" : host;
  let ok = false;
  for (let i = 0; i < 50; i++) {
    // 进程已退出说明启动失败
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`http://${healthHost}:${port}/api/health`, {
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

  // 写入状态文件
  await writeHubState({
    pid: child.pid,
    port,
    host,
    startedAt: new Date().toISOString(),
    accessToken,
  });

  console.log(`Hub started (PID: ${child.pid}, port: ${port}, host: ${host})`);
  console.log(`  Web UI: http://${healthHost}:${port}`);
  console.log(`  Token:  ${accessToken} (${tokenSource})`);
  console.log(`  Logs:   ${logPath}`);

  // 非 loopback bind 时警告（CLI 侧也提示一次）
  if (!isLoopbackHost(host)) {
    console.warn(`\n${nonLoopbackWarning(host)}`);
  }
}

/** 停止 Hub daemon */
export async function stopDaemon(): Promise<void> {
  const state = await readHubState();
  if (!state) {
    console.log("Hub is not running (no state file)");
    return;
  }

  if (!isProcessAlive(state.pid)) {
    console.log("Hub is not running (stale state file, cleaning up)");
    await cleanStateFile();
    return;
  }

  // 发送 SIGTERM
  process.kill(state.pid, "SIGTERM");
  console.log(`Stopping Hub (PID: ${state.pid})...`);

  // 等待进程退出（最多 5s）
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isProcessAlive(state.pid)) {
    await Bun.sleep(200);
  }

  if (isProcessAlive(state.pid)) {
    // 强制杀死
    process.kill(state.pid, "SIGKILL");
    console.log("Hub killed (SIGKILL)");
  } else {
    console.log("Hub stopped");
  }

  await cleanStateFile();
}

/** 获取 Hub 状态 */
export async function getDaemonStatus(): Promise<{
  running: boolean;
  state?: HubState;
}> {
  const state = await readHubState();
  if (!state || !isProcessAlive(state.pid)) {
    return { running: false };
  }
  return { running: true, state };
}
