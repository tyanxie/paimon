// paimon edge status —— 查看 Edge 运行状态

import { getEdgeDaemonStatus } from "../../edge-daemon";

export async function handleEdgeStatus(): Promise<void> {
  const { running, state } = await getEdgeDaemonStatus();
  if (running && state) {
    console.log(`Edge is running`);
    console.log(`  PID:     ${state.pid}`);
    console.log(`  Bind:    ${state.host}:${state.port}`);
    console.log(`  Edge ID: ${state.edgeId}`);
    console.log(`  Hub:     ${state.hubUrl}`);
  } else {
    console.log("Edge is not running");
  }
}
