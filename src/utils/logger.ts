// 日志模块
//
// 提供 rotating-file-stream 工厂、Logger 接口、路径计算、时间戳格式化等。
// Hub 和 Edge 通过 createLogger() 创建各自的日志实例。

import { createStream, type RotatingFileStream } from "rotating-file-stream";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { DEFAULTS } from "../protocol/types";
import { STATE_DIR } from "./env";

// ─── 路径计算 ───────────────────────────────────────────────────────────────

/**
 * 获取指定 daemon 的日志目录路径，确保目录存在。
 * 例如：getLogDir("hub") → ~/.paimon/logs/hub/
 */
export function getLogDir(name: string): string {
  const dir = join(STATE_DIR, DEFAULTS.LOGS_DIR, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 获取 stdout/stderr 兜底日志的完整路径。
 * 例如：getStdLogPath("hub") → ~/.paimon/logs/hub/hub.std.log
 */
export function getStdLogPath(name: string): string {
  const dir = getLogDir(name);
  return join(dir, `${name}${DEFAULTS.LOG_STD_SUFFIX}${DEFAULTS.LOG_EXT}`);
}

/**
 * 获取主日志文件路径（当前活跃文件）。
 * 例如：getMainLogPath("hub") → ~/.paimon/logs/hub/hub.log
 */
export function getMainLogPath(name: string): string {
  const dir = getLogDir(name);
  return join(dir, `${name}${DEFAULTS.LOG_EXT}`);
}

// ─── 时间戳 ─────────────────────────────────────────────────────────────────

/**
 * 本地时间戳，格式：2026-06-25 16:30:15.123
 * 需确保在调用前已执行 initTimezone()。
 */
export function timestamp(): string {
  const d = new Date();
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
}

// ─── readLogTail ────────────────────────────────────────────────────────────

/** 读取日志文件尾部若干行，用于启动失败时输出诊断信息 */
export async function readLogTail(
  logPath: string,
  lines = 20,
): Promise<string> {
  try {
    const content = await Bun.file(logPath).text();
    return content.split("\n").slice(-lines).join("\n").trim();
  } catch {
    return "(no log output)";
  }
}

// ─── Logger 工厂 ────────────────────────────────────────────────────────────

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  shutdown(): Promise<void>;
}

/**
 * 创建轮转日志实例。
 * @param name  日志名（如 "hub"、"edge"），决定目录和文件名
 * @param prefix  日志前缀（如 "[paimon-hub]"）
 */
export function createLogger(name: string, prefix: string): Logger {
  const dir = getLogDir(name);
  const ext = DEFAULTS.LOG_EXT;

  // 生成文件名：无 time 时为当前活跃文件，有 time+index 时为轮转历史文件
  function generator(time: number | Date, index?: number): string {
    if (!time) return `${name}${ext}`;
    return `${name}.${index}${ext}.gz`;
  }

  const stream: RotatingFileStream = createStream(generator, {
    path: dir,
    size: DEFAULTS.LOG_MAX_SIZE,
    maxFiles: DEFAULTS.LOG_MAX_FILES,
    compress: DEFAULTS.LOG_COMPRESS ? "gzip" : undefined,
  });

  function write(level: string, msg: string, args: unknown[]): void {
    const extra =
      args.length > 0
        ? " " +
          args
            .map((a) => {
              try {
                return typeof a === "string" ? a : JSON.stringify(a);
              } catch {
                return String(a);
              }
            })
            .join(" ")
        : "";
    stream.write(`${timestamp()} ${prefix} [${level}] ${msg}${extra}\n`);
  }

  return {
    info(msg, ...args) {
      write("INFO ", msg, args);
    },
    warn(msg, ...args) {
      write("WARN ", msg, args);
    },
    error(msg, ...args) {
      write("ERROR", msg, args);
    },
    debug(msg, ...args) {
      if (process.env.PAIMON_DEBUG) {
        write("DEBUG", msg, args);
      }
    },
    shutdown() {
      return new Promise((resolve) => {
        stream.end(resolve);
      });
    },
  };
}
