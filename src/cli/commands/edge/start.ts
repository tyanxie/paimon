// paimon edge start —— 启动 Edge daemon

import { startEdgeDaemon } from "../../edge-daemon";
import type { TokenOption } from "../../daemon";

export async function handleEdgeStart(
  port: number,
  host: string,
  edgeId: string,
  hubUrl: string,
  token?: string,
): Promise<void> {
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Invalid port number");
    process.exit(1);
  }
  const tokenOption: TokenOption | undefined = token
    ? { token, source: "--token" }
    : undefined;
  await startEdgeDaemon(port, host, edgeId, hubUrl, tokenOption);
}
