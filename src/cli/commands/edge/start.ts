// paimon edge start —— 启动 Edge daemon

import { startEdgeDaemon } from "../../edge-daemon";

export async function handleEdgeStart(
  port: number,
  host: string,
  edgeId: string,
  hubUrl: string,
): Promise<void> {
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Invalid port number");
    process.exit(1);
  }
  await startEdgeDaemon(port, host, edgeId, hubUrl);
}
