// paimon hub stop —— 停止 Hub daemon

import { stopDaemon } from "../../daemon";

export async function handleStop(): Promise<void> {
  await stopDaemon();
}
