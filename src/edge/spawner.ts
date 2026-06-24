// Edge 实例孵化器：在 Edge 本机指定目录 spawn 一个 headless pi 实例
//
// 从 hub/spawner.ts 迁移，逻辑基本一致：
// - pi 以 --mode rpc 启动，用 FIFO 作 stdin 防 EOF
// - detached + unref 脱离 Edge 进程
// - 注入 PAIMON_SPAWN_TOKEN + PAIMON_EDGE_PORT

import { join, isAbsolute } from "node:path";
import {
  mkdirSync,
  openSync,
  closeSync,
  statSync,
  unlinkSync,
  writeFileSync,
  constants,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DEFAULTS } from "../protocol/types";
import type { InstanceId } from "../protocol/types";
import { INSTANCES_DIR } from "./config";
import * as log from "./logger";

/** 一次等待注册的 pending 记录 */
interface PendingSpawn {
  resolve: (id: InstanceId) => void;
  reject: (err: Error) => void;
  timer: Timer;
  logPath: string;
}

/** token -> pending 解析器 */
const pending = new Map<string, PendingSpawn>();

/** 确保实例目录存在 */
function ensureInstancesDir(): void {
  mkdirSync(INSTANCES_DIR, { recursive: true });
}

/** 读取日志尾部用于诊断 */
async function readLogTail(logPath: string, lines = 20): Promise<string> {
  try {
    const content = await Bun.file(logPath).text();
    return content.split("\n").slice(-lines).join("\n").trim();
  } catch {
    return "(no log output)";
  }
}

/**
 * 校验 cwd：必须为绝对路径且为已存在的目录。
 */
export function validateCwd(cwd: string): string | null {
  if (!cwd || typeof cwd !== "string" || !cwd.trim()) {
    return "Working directory is required";
  }
  if (!isAbsolute(cwd)) {
    return `Working directory must be an absolute path: ${cwd}`;
  }
  let st;
  try {
    st = statSync(cwd);
  } catch {
    return `Directory does not exist: ${cwd}`;
  }
  if (!st.isDirectory()) {
    return `Not a directory: ${cwd}`;
  }
  return null;
}

/**
 * 在指定目录 spawn 一个 headless pi 实例，等待其注册成功后返回 instanceId。
 * @param cwd 工作目录
 * @param token 可选外部提供的 token（Hub 委托 spawn 时传入）
 */
export async function spawnInstance(
  cwd: string,
  token?: string,
): Promise<InstanceId> {
  if (!Bun.which("pi")) {
    throw new Error("'pi' command not found in PATH");
  }

  ensureInstancesDir();

  const spawnToken = token ?? randomUUID();
  const port = parseInt(
    process.env.PAIMON_EDGE_PORT || String(DEFAULTS.EDGE_PORT),
    10,
  );
  const logPath = join(INSTANCES_DIR, `${spawnToken}.log`);
  const fifoPath = join(INSTANCES_DIR, `${spawnToken}.stdin`);

  // 创建 FIFO
  const mk = spawnSync("mkfifo", [fifoPath]);
  if (mk.status !== 0) {
    throw new Error(
      `Failed to create FIFO at ${fifoPath}: ${mk.stderr?.toString() || "mkfifo failed"}`,
    );
  }

  let logFd: number;
  let stdinFd: number;
  try {
    logFd = openSync(logPath, "a");
    stdinFd = openSync(fifoPath, constants.O_RDWR);
  } catch (err) {
    try {
      unlinkSync(fifoPath);
    } catch {
      // 忽略
    }
    throw new Error(`Failed to open spawn fds: ${(err as Error).message}`);
  }

  let child;
  try {
    child = Bun.spawn(["pi", "--mode", "rpc"], {
      cwd,
      env: {
        ...process.env,
        // pi extension 连接 Edge 的端口
        PAIMON_EDGE_PORT: String(port),
        PAIMON_SPAWN_TOKEN: spawnToken,
      },
      stdin: stdinFd,
      stdout: "ignore", // 事件流通过 WS 传输，不需要落盘
      stderr: logFd, // 仅保留错误输出用于启动失败诊断
      detached: true,
    });
  } finally {
    closeSync(logFd);
    closeSync(stdinFd);
    try {
      unlinkSync(fifoPath);
    } catch {
      // 忽略
    }
  }

  // 写 pidfile，清理模块据此判断进程是否存活
  if (child.pid != null) {
    const pidPath = join(INSTANCES_DIR, `${spawnToken}.pid`);
    writeFileSync(pidPath, String(child.pid));
  }

  child.unref();

  const pid = child.pid;
  log.info(
    `Spawned pi instance (pid: ${pid}, cwd: ${cwd}, token: ${spawnToken})`,
  );

  // 监测早退
  child.exited.then(async (code) => {
    const p = pending.get(spawnToken);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(spawnToken);
    const tail = await readLogTail(logPath);
    log.error(
      `pi (pid: ${pid}) exited (code ${code}) before registering. Recent logs:\n${tail}`,
    );
    p.reject(new Error(`pi exited (code ${code}) before registering`));
  });

  // 等待注册
  return new Promise<InstanceId>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(async () => {
      pending.delete(spawnToken);
      child.kill();
      const tail = await readLogTail(logPath);
      log.error(
        `pi (pid: ${pid}) did not register within ${DEFAULTS.SPAWN_REGISTER_TIMEOUT / 1000}s, killed. Recent logs:\n${tail}`,
      );
      rejectPromise(
        new Error(
          `pi did not register within ${DEFAULTS.SPAWN_REGISTER_TIMEOUT / 1000}s`,
        ),
      );
    }, DEFAULTS.SPAWN_REGISTER_TIMEOUT);

    pending.set(spawnToken, {
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
      logPath,
    });
  });
}

/**
 * pi 注册时调用：若 token 对应 pending spawn，则 resolve。
 */
export function resolveSpawn(token: string, instanceId: InstanceId): boolean {
  const p = pending.get(token);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(token);
  p.resolve(instanceId);
  return true;
}
