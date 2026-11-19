import type { SessionSummary } from "./types";

export type SessionWorkerRequest =
  | { type: "register"; instanceId: string; sessionFile?: string }
  | { type: "unregister"; instanceId: string };

export type SessionWorkerResponse =
  | { type: "snapshot"; directory: string; sessions: SessionSummary[] }
  | { type: "error"; directory: string; message: string };
