// paimon hub start —— 启动 Hub daemon

import { startDaemon, type TokenOption } from "../../daemon";

export async function handleStart(
  port: number,
  host: string,
  token?: string,
): Promise<void> {
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Invalid port number");
    process.exit(1);
  }
  const tokenOption: TokenOption | undefined = token
    ? { token, source: "--token" }
    : undefined;
  await startDaemon(port, host, tokenOption);
}
