// paimon edge logs —— 查看 Edge 日志

import { DEFAULTS } from "../../../protocol/types";
import { getEdgeStatePath } from "../../edge-daemon";

export async function handleEdgeLogs(follow: boolean): Promise<void> {
  const logPath = getEdgeStatePath(DEFAULTS.EDGE_LOG_FILE);

  const file = Bun.file(logPath);
  if (!(await file.exists())) {
    console.log("No log file found");
    return;
  }

  if (follow) {
    const proc = Bun.spawn(["tail", "-f", logPath], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  } else {
    const proc = Bun.spawn(["tail", "-50", logPath], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }
}
