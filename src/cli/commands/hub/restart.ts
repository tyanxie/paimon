// paimon hub restart —— 重启 Hub daemon

import { DEFAULTS } from "../../../protocol/types";
import {
  readHubState,
  stopDaemon,
  startDaemon,
  type TokenOption,
} from "../../daemon";

export async function handleRestart(
  port: number | undefined,
  host: string | undefined,
  token?: string,
): Promise<void> {
  // 先读取当前状态（stop 会清理状态文件，必须先读）
  const prevState = await readHubState();

  // 未指定则继承之前的值，兜底用默认值
  const finalPort = port ?? prevState?.port ?? DEFAULTS.PORT;
  const finalHost = host ?? prevState?.host ?? DEFAULTS.HOST;

  if (isNaN(finalPort) || finalPort < 1 || finalPort > 65535) {
    console.error("Invalid port number");
    process.exit(1);
  }

  // 停止现有 Hub
  await stopDaemon();

  // 重新启动：显式 --token > 旧 hub.json token > 自动生成
  let tokenOption: TokenOption | undefined;
  if (token) {
    tokenOption = { token, source: "--token" };
  } else if (prevState?.accessToken) {
    tokenOption = { token: prevState.accessToken, source: "inherited" };
  }
  await startDaemon(finalPort, finalHost, tokenOption);
}
