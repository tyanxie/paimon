// 实例日志定期清理
//
// 扫描 ~/.paimon/instances/，通过 pidfile 判断对应 pi 进程是否存活：
// - 有 .pid 文件 → 读取 pid，kill(pid, 0) 检测存活性
// - 进程已死 → 删除 .log + .pid
// - 无 .pid 文件（历史遗留）→ mtime 超过 LOG_LEGACY_MAX_AGE 则删除
//
// stdout 已重定向到 "ignore"，日志文件仅含 stderr（通常为空）。

import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULTS } from "../protocol/types";
import { INSTANCES_DIR } from "./config";
import * as log from "./logger";

/** 检测指定 pid 的进程是否存活 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = 进程存在但无权限发送信号，视为存活
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

const TAG = "[InstanceLogCleanup]";

/** 执行一次清理扫描 */
export async function cleanupInstanceLogs(): Promise<void> {
  let files: string[];
  try {
    files = await readdir(INSTANCES_DIR);
  } catch {
    log.info(`${TAG} Scan started, instances directory not found, skipped`);
    return;
  }

  const logFiles = files.filter((f) => f.endsWith(".log"));
  log.info(`${TAG} Scan started, found ${logFiles.length} log file(s)`);

  const now = Date.now();
  let cleaned = 0;

  for (const logFile of logFiles) {
    const token = logFile.slice(0, -4); // 去掉 .log
    const logPath = join(INSTANCES_DIR, logFile);
    const pidPath = join(INSTANCES_DIR, `${token}.pid`);

    let shouldDelete = false;
    let reason = "";

    // 尝试读取对应的 pidfile
    let pid: number | null = null;
    try {
      const content = await readFile(pidPath, "utf-8");
      pid = parseInt(content.trim(), 10);
    } catch {
      // 无 pidfile（历史遗留文件）
    }

    if (pid !== null && !isNaN(pid)) {
      // 有 pid → 检测进程是否存活
      if (!isProcessAlive(pid)) {
        shouldDelete = true;
        reason = `process ${pid} not alive`;
      }
    } else {
      // 无 pidfile → mtime 超过阈值才删除
      try {
        const st = await stat(logPath);
        if (now - st.mtimeMs > DEFAULTS.LOG_LEGACY_MAX_AGE) {
          shouldDelete = true;
          reason = "no pidfile, mtime expired";
        }
      } catch {
        continue;
      }
    }

    if (shouldDelete) {
      log.info(`${TAG} Removing ${token} (${reason})`);
      try {
        await unlink(logPath);
      } catch (e) {
        log.error(
          `${TAG} Failed to remove ${logPath}: ${(e as Error).message}`,
        );
      }
      if (pid !== null && !isNaN(pid)) {
        try {
          await unlink(pidPath);
        } catch (e) {
          log.error(
            `${TAG} Failed to remove ${pidPath}: ${(e as Error).message}`,
          );
        }
      }
      cleaned++;
    }
  }

  log.info(
    `${TAG} Scan finished, removed ${cleaned}/${logFiles.length} log file(s)`,
  );
}

let timer: Timer | undefined;

/** 启动定期清理（启动时立即执行一次） */
export function startLogCleanup(): void {
  cleanupInstanceLogs();
  timer = setInterval(cleanupInstanceLogs, DEFAULTS.LOG_CLEANUP_INTERVAL);
}

/** 停止定期清理 */
export function stopLogCleanup(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
