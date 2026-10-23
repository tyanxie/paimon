import type { BrowseEntry } from "@protocol/types";
import { isRecord } from "../../utils/typeGuards";
import type { InstanceCreationEdge } from "./types";

function isInstanceCreationEdge(value: unknown): value is InstanceCreationEdge {
  return (
    isRecord(value) &&
    typeof value.edgeId === "string" &&
    typeof value.hostname === "string" &&
    typeof value.homedir === "string"
  );
}

/** 识别创建表单使用的 Edge 字段，保留原始列表。 */
export function isInstanceCreationEdgesResponse(
  value: unknown,
): value is { edges: InstanceCreationEdge[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.edges) &&
    value.edges.every(isInstanceCreationEdge)
  );
}

export function isBrowseEntry(value: unknown): value is BrowseEntry {
  return isRecord(value) && typeof value.name === "string";
}
