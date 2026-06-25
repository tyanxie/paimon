// paimon hub logs —— 查看 Hub 日志

import { DEFAULTS } from "../../../protocol/types";
import { getMainLogPath } from "../../../utils/log-stream";

export async function handleLogs(follow: boolean): Promise<void> {
  const logPath = getMainLogPath(DEFAULTS.HUB_LOG_NAME);

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
    // 输出最后 50 行
    const proc = Bun.spawn(["tail", "-50", logPath], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  }
}
