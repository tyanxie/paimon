import type { EdgeInfo } from "@protocol/types";

export type InstanceCreationEdge = Pick<
  EdgeInfo,
  "edgeId" | "hostname" | "homedir"
>;
