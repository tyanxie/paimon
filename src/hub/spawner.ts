// 实例孵化器：在 Hub 本机指定目录 spawn 一个 headless pi 实例
//
// 设计要点（均经实测确定）：
// - pi 必须以 `--mode rpc` 启动才能 headless 常驻（无 TUI）
// - RPC 模式从 stdin 读命令，stdin EOF 即退出；而 paimon 对话全程走 WS，
//   根本不需要 stdin。故用 O_RDWR 打开的 FIFO 作 stdin：pi 自持读写两端，
//   永不 EOF，且不依赖任何外部进程
// - detached: true + child.unref()：pi setsid 脱离 Hub 进程组，Hub 退出/重启
//   都不影响 pi（reparent 到 init），extension 自动重连后继续可用
// - 注入 PAIMON_SPAWN_TOKEN：pi 的 paimon extension 注册时回传该 token，
//   Hub 据此把 spawn 请求与注册成功的实例对应起来（不靠 pid，规避复用风险）

import { resolve, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, openSync, closeSync, statSync, unlinkSync } from "node:fs";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { DEFAULTS } from "../protocol/types";
import type { InstanceId } from "../protocol/types";
import * as log from "./logger";

/** 状态目录，展开 ~ */
const STATE_DIR = resolve(homedir(), ".paimon");
/** spawn 实例的运行时文件目录（日志、FIFO） */
const INSTANCES_DIR = join(STATE_DIR, DEFAULTS.INSTANCES_DIR);

/** 一次等待注册的 pending 记录 */
interface PendingSpawn {
  resolve: (id: InstanceId) => void;
  reject: (err: Error) => void;
  timer: Timer;
  /** 日志路径，用于超时诊断 */
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
 * 返回 null 表示合法，否则返回错误信息。
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
 * 失败（pi 命令缺失 / 进程早退 / 注册超时）会 reject。
 */
export async function spawnInstance(cwd: string): Promise<InstanceId> {
  // 前置检测：Bun.spawn 对命令不存在不会同步抛错，需先查 PATH
  if (!Bun.which("pi")) {
    throw new Error("'pi' command not found in PATH");
  }

  ensureInstancesDir();

  const token = randomUUID();
  const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);
  const logPath = join(INSTANCES_DIR, `${token}.log`);
  const fifoPath = join(INSTANCES_DIR, `${token}.stdin`);

  // 创建 FIFO（命名管道）。系统无 mkfifo 时报错退出。
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
    // O_RDWR 打开 FIFO：读写端同时存在，pi 持有的 dup 永不 EOF
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
        PAIMON_PORT: String(port),
        PAIMON_SPAWN_TOKEN: token,
      },
      stdin: stdinFd,
      stdout: logFd,
      stderr: logFd,
      // detached: setsid 脱离 Hub 进程组，Hub 退出后 reparent 到 init
      detached: true,
    });
  } finally {
    // 子进程已继承 fd 副本（dup），父进程侧立即关闭，避免泄漏与 EOF 干扰
    closeSync(logFd);
    closeSync(stdinFd);
    // FIFO 已被 pi 以 O_RDWR 持有（inode 保留），文件名可立即 unlink，避免残留
    try {
      unlinkSync(fifoPath);
    } catch {
      // 忽略
    }
  }

  // unref 让 Hub 不再等待子进程退出
  child.unref();

  const pid = child.pid;
  log.info(`Spawned pi instance (pid: ${pid}, cwd: ${cwd}, token: ${token})`);

  // 异步监测早退：若还有 pending，说明进程在注册前就退出了
  child.exited.then(async (code) => {
    const p = pending.get(token);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(token);
    // 日志尾部仅用于服务端诊断，不回传给调用方（避免泄露 pi 内部输出）
    const tail = await readLogTail(logPath);
    log.error(
      `pi (pid: ${pid}) exited (code ${code}) before registering. Recent logs:\n${tail}`,
    );
    p.reject(new Error(`pi exited (code ${code}) before registering`));
  });

  // 等待 register 回传 token
  return new Promise<InstanceId>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(async () => {
      pending.delete(token);
      // 超时仍未注册：杀掉这个孤儿 pi，避免它晚于超时才注册、凭空出现在列表里
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

    pending.set(token, {
      resolve: resolvePromise,
      reject: rejectPromise,
      timer,
      logPath,
    });
  });
}

/**
 * 注册时由 registry 调用：若该 token 对应一个 pending spawn，则 resolve 之。
 * 返回是否命中（命中说明这是 Hub spawn 的实例）。
 */
export function resolveSpawn(token: string, instanceId: InstanceId): boolean {
  const p = pending.get(token);
  if (!p) return false;
  clearTimeout(p.timer);
  pending.delete(token);
  p.resolve(instanceId);
  return true;
}
