// Edge 日志模块

const LOG_PREFIX = "[paimon-edge]";

function timestamp(): string {
  return new Date().toISOString();
}

export function info(msg: string, ...args: unknown[]): void {
  console.log(`${timestamp()} ${LOG_PREFIX} ${msg}`, ...args);
}

export function warn(msg: string, ...args: unknown[]): void {
  console.warn(`${timestamp()} ${LOG_PREFIX} WARN ${msg}`, ...args);
}

export function error(msg: string, ...args: unknown[]): void {
  console.error(`${timestamp()} ${LOG_PREFIX} ERROR ${msg}`, ...args);
}

export function debug(msg: string, ...args: unknown[]): void {
  if (process.env.PAIMON_DEBUG) {
    console.log(`${timestamp()} ${LOG_PREFIX} DEBUG ${msg}`, ...args);
  }
}
