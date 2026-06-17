// paimon hub status —— 查看 Hub 运行状态

import { getDaemonStatus } from "../../daemon";
import { maskToken } from "../../../hub/auth";

export async function handleStatus(): Promise<void> {
  const { running, state } = await getDaemonStatus();
  if (running && state) {
    const displayHost =
      state.host === "0.0.0.0" || state.host === "127.0.0.1"
        ? "localhost"
        : state.host;
    console.log(`Hub is running`);
    console.log(`  PID:   ${state.pid}`);
    console.log(`  Bind:  ${state.host}:${state.port}`);
    console.log(`  URL:   http://${displayHost}:${state.port}`);
    console.log(`  Token: ${maskToken(state.accessToken)}`);
  } else {
    console.log("Hub is not running");
  }
}
