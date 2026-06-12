// paimon edge stop —— 停止 Edge daemon

import { stopEdgeDaemon } from "../../edge-daemon";

export async function handleEdgeStop(): Promise<void> {
  await stopEdgeDaemon();
}
