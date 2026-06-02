// paimon hub logs —— 查看 Hub 日志

import { DEFAULTS } from "../../../protocol/types";
import { getStatePath } from "../../daemon";

export async function handleLogs(follow: boolean): Promise<void> {
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
