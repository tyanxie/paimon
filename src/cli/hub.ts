// paimon hub 子命令: start / stop / status / logs

import { DEFAULTS } from "../protocol/types";
import {
  startDaemon,
  stopDaemon,
  readPort,
  getDaemonStatus,
  getStatePath,
} from "./daemon";

export async function hubCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "start":
      await handleStart(rest);
      break;
    case "stop":
      await stopDaemon();
      break;
    case "restart":
      await handleRestart(rest);
      break;
    case "status":
      await handleStatus();
      break;
    case "logs":
      await handleLogs(rest);
      break;
    default:
      console.error(`Unknown hub subcommand: ${subcommand}`);
      console.log("Usage: paimon hub <start|stop|restart|status|logs>");
      process.exit(1);
  }
}

async function handleStart(args: string[]): Promise<void> {
  let port = DEFAULTS.PORT;

  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Invalid port number");
      process.exit(1);
    }
  }

  let host = DEFAULTS.HOST;
  const hostIdx = args.indexOf("--host");
  if (hostIdx !== -1 && args[hostIdx + 1]) {
    host = args[hostIdx + 1];
  }

  await startDaemon(port, host);
}

async function handleStatus(): Promise<void> {
  const status = await getDaemonStatus();
  if (status.running) {
    console.log(`Hub is running`);
    console.log(`  PID:  ${status.pid}`);
    console.log(`  Port: ${status.port ?? "unknown"}`);
    console.log(`  URL:  http://localhost:${status.port ?? DEFAULTS.PORT}`);
  } else {
    console.log("Hub is not running");
  }
}

async function handleRestart(args: string[]): Promise<void> {
  // 先读取当前端口（stop 会清理状态文件，必须先读）
  const currentPort = await readPort();

  // 解析命令行参数（允许覆盖）
  let port = DEFAULTS.PORT;
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Invalid port number");
      process.exit(1);
    }
  } else if (currentPort) {
    // 未指定则继承之前运行的端口
    port = currentPort;
  }

  let host = DEFAULTS.HOST;
  const hostIdx = args.indexOf("--host");
  if (hostIdx !== -1 && args[hostIdx + 1]) {
    host = args[hostIdx + 1];
  }

  // 停止现有 Hub
  await stopDaemon();

  // 重新启动
  await startDaemon(port, host);
}

async function handleLogs(args: string[]): Promise<void> {
  const follow = args.includes("--follow") || args.includes("-f");
  const logPath = getStatePath(DEFAULTS.LOG_FILE);

  const file = Bun.file(logPath);
  if (!(await file.exists())) {
    console.log("No log file found");
    return;
  }

  if (follow) {
    // 使用 tail -f 跟踪
    const proc = Bun.spawn(["tail", "-f", logPath], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  } else {
    // 输出最后 50 行
    const proc = Bun.spawn(["tail", "-50", logPath], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }
}
