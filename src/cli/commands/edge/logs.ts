// paimon edge logs —— 查看 Edge 日志

import { DEFAULTS } from "../../../protocol/types";
import { getMainLogPath } from "../../../utils/log-stream";

export async function handleEdgeLogs(follow: boolean): Promise<void> {
  const logPath = getMainLogPath(DEFAULTS.EDGE_LOG_NAME);

  const file = Bun.file(logPath);
  if (!(await file.exists())) {
    console.log("No log file found");
    return;
  }

  if (follow) {
    // 使用 --follow=name 确保轮转后 tail 能跟随新创建的同名文件
    const proc = Bun.spawn(["tail", "--follow=name", logPath], {
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
