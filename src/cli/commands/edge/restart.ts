// paimon edge restart —— 重启 Edge daemon

import { hostname } from "node:os";
import { DEFAULTS } from "../../../protocol/types";
import {
  readEdgeState,
  stopEdgeDaemon,
  startEdgeDaemon,
} from "../../edge-daemon";

export async function handleEdgeRestart(
  port: number | undefined,
  host: string | undefined,
  edgeId: string | undefined,
  hubUrl: string | undefined,
): Promise<void> {
  const prevState = await readEdgeState();

  const finalPort = port ?? prevState?.port ?? DEFAULTS.EDGE_PORT;
  const finalHost = host ?? prevState?.host ?? DEFAULTS.EDGE_HOST;
  const finalEdgeId = edgeId ?? prevState?.edgeId ?? hostname();
  const finalHubUrl = hubUrl ?? prevState?.hubUrl ?? DEFAULTS.EDGE_HUB_URL;

  if (isNaN(finalPort) || finalPort < 1 || finalPort > 65535) {
    console.error("Invalid port number");
    process.exit(1);
  }

  await stopEdgeDaemon();
  await startEdgeDaemon(finalPort, finalHost, finalEdgeId, finalHubUrl);
}
