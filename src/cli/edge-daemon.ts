// Edge Daemon 进程管理：启动/停止/状态查询

import { join, resolve } from "node:path";
import { mkdir, unlink, rename } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import { DEFAULTS } from "../protocol/types";
import type { EdgeState } from "../protocol/types";
import {
  isLoopbackHost,
  nonLoopbackWarning,
  isCompiled,
  STATE_DIR,
} from "../utils/env";
import { maskToken } from "../hub/auth";
import { readHubState } from "./daemon";
import { getStdLogPath, getMainLogPath, readLogTail } from "../utils/logger";

/** 获取状态文件路径 */
export function getEdgeStatePath(filename: string): string {
  return join(STATE_DIR, filename);
}

/** 确保状态目录存在 */
async function ensureStateDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
}

/** 读取 Edge 状态文件 */
export async function readEdgeState(): Promise<EdgeState | null> {
  try {
    const content = await Bun.file(
      getEdgeStatePath(DEFAULTS.EDGE_STATE_FILE),
    ).text();
    const state = JSON.parse(content) as EdgeState;
    if (!state.pid || !state.port || !state.host) return null;
    return state;
  } catch {
    return null;
  }
}

/** 原子写入 Edge 状态文件 */
async function writeEdgeState(state: EdgeState): Promise<void> {
  await ensureStateDir();
  const target = getEdgeStatePath(DEFAULTS.EDGE_STATE_FILE);
  const tmp = `${target}.tmp`;
  await Bun.write(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, target);
}

/** 删除状态文件 */
async function cleanEdgeStateFile(): Promise<void> {
  try {
    await unlink(getEdgeStatePath(DEFAULTS.EDGE_STATE_FILE));
  } catch {
    // 文件不存在忽略
  }
}

/** 检查进程是否存活 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Token 来源描述 */
type EdgeTokenSource = "env" | "--token" | "hub.json";

/**
 * 确定 Edge 连接 Hub 的 access token。
 * 优先级：环境变量 > 显式传入 > hub.json。
 * 全部找不到时返回 null（不携带 token 连接，会被 Hub 拒绝）。
 */
async function resolveEdgeToken(
  explicitToken?: string,
): Promise<{ token: string; source: EdgeTokenSource } | null> {
  const envToken = process.env.PAIMON_ACCESS_TOKEN;
  if (envToken) return { token: envToken, source: "env" };
  if (explicitToken) return { token: explicitToken, source: "--token" };
  // 同机 fallback：尝试从 hub.json 读取
  const hubState = await readHubState();
  if (hubState?.accessToken) {
    return { token: hubState.accessToken, source: "hub.json" };
  }
  return null;
}

/** 启动 Edge daemon */
export async function startEdgeDaemon(
  port: number,
  host: string,
  edgeId: string,
  hubUrl: string,
  explicitToken?: string,
): Promise<void> {
  // 检查是否已在运行
  const existing = await readEdgeState();
  if (existing && isProcessAlive(existing.pid)) {
    console.log(
      `Edge is already running (PID: ${existing.pid}, port: ${existing.port}, id: ${existing.edgeId})`,
    );
    return;
  }

  // 清理可能残留的 stale 状态文件
  await cleanEdgeStateFile();

  await ensureStateDir();

  // 解析 access token
  const tokenResult = await resolveEdgeToken(explicitToken);

  // stdout/stderr 兜底日志：仅捕获未处理异常和 Bun runtime crash
  const stdLogPath = getStdLogPath(DEFAULTS.EDGE_LOG_NAME);
  const stdLogFd = openSync(stdLogPath, "a");

  // Fork Edge 进程：通过 PAIMON_ROLE 环境变量让同一二进制以 edge 角色启动
  // 编译后二进制直接 spawn 自身；源码模式需要带上入口脚本

  const cliEntry = resolve(import.meta.dirname!, "index.ts");
  const spawnArgs = isCompiled
    ? [process.execPath]
    : [process.execPath, cliEntry];
  const child = Bun.spawn(spawnArgs, {
    env: {
      ...process.env,
      PAIMON_ROLE: "edge",
      PAIMON_EDGE_PORT: String(port),
      PAIMON_EDGE_HOST: host,
      PAIMON_EDGE_ID: edgeId,
      PAIMON_HUB_URL: hubUrl,
      ...(tokenResult ? { PAIMON_ACCESS_TOKEN: tokenResult.token } : {}),
    },
    stdin: "ignore",
    // stdout/stderr 仅作为 crash 兜底，正常结构化日志走 rotating-file-stream
    stdout: stdLogFd,
    stderr: stdLogFd,
    detached: true,
  });

  child.unref();
  closeSync(stdLogFd);

  // 轮询健康检查
  const healthHost =
    host === "0.0.0.0" || isLoopbackHost(host) ? "127.0.0.1" : host;
  let ok = false;
  for (let i = 0; i < 50; i++) {
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
      // 尚未就绪
    }
    await Bun.sleep(100);
  }

  if (!ok) {
    const tail = await readLogTail(stdLogPath);
    console.error(`Failed to start Edge. Recent logs:\n${tail}`);
    process.exit(1);
  }

  // 写入状态文件
  await writeEdgeState({
    pid: child.pid,
    port,
    host,
    edgeId,
    hubUrl,
    startedAt: new Date().toISOString(),
  });

  console.log(`Edge started (PID: ${child.pid}, port: ${port}, id: ${edgeId})`);
  console.log(`  Hub:   ${hubUrl}`);
  if (tokenResult) {
    console.log(
      `  Token: ${maskToken(tokenResult.token)} (from ${tokenResult.source})`,
    );
  } else {
    console.warn(`  Token: (none) — Hub may reject connection`);
  }
  console.log(`  Logs:  ${getMainLogPath(DEFAULTS.EDGE_LOG_NAME)}`);

  if (!isLoopbackHost(host)) {
    console.warn(`\n${nonLoopbackWarning(host)}`);
  }
}

/** 停止 Edge daemon */
export async function stopEdgeDaemon(): Promise<void> {
  const state = await readEdgeState();
  if (!state) {
    console.log("Edge is not running (no state file)");
    return;
  }

  if (!isProcessAlive(state.pid)) {
    console.log("Edge is not running (stale state file, cleaning up)");
    await cleanEdgeStateFile();
    return;
  }

  process.kill(state.pid, "SIGTERM");
  console.log(`Stopping Edge (PID: ${state.pid})...`);

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isProcessAlive(state.pid)) {
    await Bun.sleep(200);
  }

  if (isProcessAlive(state.pid)) {
    process.kill(state.pid, "SIGKILL");
    console.log("Edge killed (SIGKILL)");
  } else {
    console.log("Edge stopped");
  }

  await cleanEdgeStateFile();
}

/** 获取 Edge 状态 */
export async function getEdgeDaemonStatus(): Promise<{
  running: boolean;
  state?: EdgeState;
}> {
  const state = await readEdgeState();
  if (!state || !isProcessAlive(state.pid)) {
    return { running: false };
  }
  return { running: true, state };
}
