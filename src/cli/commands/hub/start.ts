// paimon hub start —— 启动 Hub daemon

import { startDaemon } from "../../daemon";

export async function handleStart(port: number, host: string): Promise<void> {
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Invalid port number");
    process.exit(1);
  }
  await startDaemon(port, host);
}
