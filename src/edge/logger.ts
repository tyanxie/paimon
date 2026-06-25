// Edge 日志模块 —— 基于 rotating-file-stream 的轮转日志
//
// 日志直接写入轮转文件流，不经过 stdout/stderr。
// 进程的 stdout/stderr 仅用于捕获未处理异常和 Bun runtime crash。

import { DEFAULTS } from "../protocol/types";
import { createLogStream, timestamp } from "../utils/log-stream";
import type { RotatingFileStream } from "rotating-file-stream";

const LOG_PREFIX = "[paimon-edge]";

const stream: RotatingFileStream = createLogStream(DEFAULTS.EDGE_LOG_NAME);

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
  stream.write(`${timestamp()} ${LOG_PREFIX} ${level}${msg}${extra}\n`);
}

export function info(msg: string, ...args: unknown[]): void {
  write("", msg, args);
}

export function warn(msg: string, ...args: unknown[]): void {
  write("WARN ", msg, args);
}

export function error(msg: string, ...args: unknown[]): void {
  write("ERROR ", msg, args);
}

export function debug(msg: string, ...args: unknown[]): void {
  if (process.env.PAIMON_DEBUG) {
    write("DEBUG ", msg, args);
  }
}

/** 优雅关闭：flush 缓冲区并关闭文件流 */
export function shutdown(): Promise<void> {
  return new Promise((resolve) => {
    stream.end(resolve);
  });
}
