// 日志流工具模块
//
// 提供 rotating-file-stream 工厂、时间戳格式化、路径计算、旧日志迁移等共享功能。
// Hub 和 Edge 的 logger 模块均通过此模块创建轮转日志流。

import { createStream, type RotatingFileStream } from "rotating-file-stream";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { DEFAULTS } from "../protocol/types";

/** 状态根目录 ~/.paimon */
const STATE_DIR = resolve(homedir(), ".paimon");

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

/**
 * 创建轮转日志流。
 * 轮转策略：按大小切分，保留指定数量历史文件，gzip 压缩。
 * 文件命名：{name}.log → {name}.1.log.gz → {name}.2.log.gz → ...
 */
export function createLogStream(name: string): RotatingFileStream {
  const dir = getLogDir(name);
  const ext = DEFAULTS.LOG_EXT;

  // 生成文件名：无 time 时为当前活跃文件，有 time+index 时为轮转历史文件
  function generator(time: number | Date, index?: number): string {
    if (!time) return `${name}${ext}`; // hub.log
    return `${name}.${index}${ext}.gz`; // hub.1.log.gz
  }

  return createStream(generator, {
    path: dir,
    size: DEFAULTS.LOG_MAX_SIZE,
    maxFiles: DEFAULTS.LOG_MAX_FILES,
    compress: DEFAULTS.LOG_COMPRESS ? "gzip" : undefined,
  });
}

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
