import { useMemo } from "react";
import type { InstanceStatus } from "../../../../protocol/types";
import {
  getSessionEntryRenderKey,
  type ConversationExecution,
  type ConversationItem,
  type ConversationReply,
  type ConversationSource,
  type ConversationToolState,
  type SessionEntry,
  type ToolExecutionState,
} from "../../stores/types";

/** 从原始条目派生展示分组，分页与滚动继续使用原始 entries。 */
export function useConversationDisplay(
  entries: readonly SessionEntry[],
  toolExecutions: ReadonlyMap<string, ToolExecutionState>,
  streamingEntry: SessionEntry | null,
  status?: InstanceStatus,
  liveToolCallIds: ReadonlySet<string> = EMPTY_TOOL_CALL_IDS,
): ConversationItem[] {
  return useMemo(
    () =>
      buildConversationItems(
        entries,
        toolExecutions,
        streamingEntry,
        status,
        liveToolCallIds,
      ),
    [entries, toolExecutions, streamingEntry, status, liveToolCallIds],
  );
}

const EMPTY_TOOL_CALL_IDS = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getToolState(
  toolCallId: string,
  entry: SessionEntry,
  results: ReadonlyMap<string, SessionEntry>,
  toolExecutions: ReadonlyMap<string, ToolExecutionState>,
  status: InstanceStatus | undefined,
  pending: boolean,
): ConversationToolState {
  const resultEntry = results.get(toolCallId);
  if (resultEntry?.message) {
    const message = resultEntry.message;
    return {
      status: message.isError === true ? "error" : "completed",
      result: message,
      resultEntry,
      durationMs:
        typeof message.durationMs === "number" ? message.durationMs : undefined,
    };
  }

  const execution = toolExecutions.get(toolCallId);
  if (execution?.status === "completed") {
    return {
      status: execution.isError ? "error" : "completed",
      result: execution.result,
      durationMs: execution.durationMs,
    };
  }
  if (
    entry.message?.stopReason === "aborted" ||
    entry.message?.stopReason === "error"
  ) {
    return { status: "aborted" };
  }
  if (execution?.status === "running" && status !== "idle") {
    return { status: "running", execution };
  }
  if (pending && status !== "idle") return { status: "pending" };
  return { status: "unknown" };
}

function buildConversationItems(
  entries: readonly SessionEntry[],
  toolExecutions: ReadonlyMap<string, ToolExecutionState>,
  streamingEntry: SessionEntry | null,
  status: InstanceStatus | undefined,
  liveToolCallIds: ReadonlySet<string>,
): ConversationItem[] {
  // 先索引结果，跨正文和系统事件的结果仍归属于原工具。
  const results = new Map<string, SessionEntry>();
  for (const entry of entries) {
    const message = entry.message;
    if (
      entry.type === "message" &&
      message?.role === "toolResult" &&
      typeof message.toolCallId === "string" &&
      !results.has(message.toolCallId)
    ) {
      results.set(message.toolCallId, entry);
    }
  }

  const items: ConversationItem[] = [];
  const toolOwners = new Map<string, ConversationReply>();
  let userEntryKey: string | undefined;
  let reply: ConversationReply | undefined;
  let execution: ConversationExecution | undefined;

  function ensureReply(entry: SessionEntry): ConversationReply {
    if (!reply) {
      reply = {
        type: "reply",
        key: `reply:${userEntryKey ?? getSessionEntryRenderKey(entry)}`,
        userEntryKey,
        entries: [],
        parts: [],
      };
      items.push(reply);
    }
    return reply;
  }

  function ensureExecution(source: ConversationSource): ConversationExecution {
    if (!execution) {
      execution = {
        type: "execution",
        key: `execution:${source.key}`,
        items: [],
        counts: {
          pending: 0,
          running: 0,
          completed: 0,
          error: 0,
          aborted: 0,
          unknown: 0,
        },
      };
      ensureReply(source.entry).parts.push(execution);
    }
    return execution;
  }

  for (const entry of entries) {
    if (entry.type === "compaction" || entry.type === "branch_summary") {
      const event = {
        type: "system" as const,
        key: getSessionEntryRenderKey(entry),
        entry,
      };
      if (reply) {
        reply.entries.push(entry);
        reply.parts.push(event);
      } else {
        items.push(event);
      }
      execution = undefined;
      continue;
    }
    if (entry.type !== "message" || !entry.message) continue;
    const message = entry.message;
    if (message.role === "user") {
      userEntryKey = getSessionEntryRenderKey(entry);
      items.push({ type: "user", key: userEntryKey, entry });
      reply = undefined;
      execution = undefined;
      continue;
    }
    if (message.role === "toolResult") {
      if (typeof message.toolCallId === "string") {
        toolOwners.get(message.toolCallId)?.entries.push(entry);
      }
      continue;
    }
    if (message.role !== "assistant") continue;

    const currentReply = ensureReply(entry);
    currentReply.entries.push(entry);
    const entryKey = getSessionEntryRenderKey(entry);
    const blocks: unknown[] = Array.isArray(message.content)
      ? message.content
      : typeof message.content === "string"
        ? [{ type: "text", text: message.content }]
        : [];

    for (const [blockIndex, block] of blocks.entries()) {
      if (!isRecord(block)) continue;
      const source: ConversationSource = {
        key: `${entryKey}:block:${blockIndex}`,
        entry,
        blockIndex,
        streaming: entry === streamingEntry && blockIndex === blocks.length - 1,
      };
      if (block.type === "text" && typeof block.text === "string") {
        if (!block.text.trim()) continue;
        currentReply.parts.push({
          type: "text",
          key: source.key,
          source,
          content: block.text,
        });
        execution = undefined;
      } else if (
        block.type === "thinking" &&
        typeof block.thinking === "string"
      ) {
        const group = ensureExecution(source);
        if (!block.thinking.trim()) continue;
        group.items.push({
          type: "thinking",
          key: source.key,
          source,
          content: block.thinking,
        });
      } else if (
        block.type === "toolCall" &&
        typeof block.id === "string" &&
        typeof block.name === "string"
      ) {
        if (toolOwners.has(block.id)) continue;
        toolOwners.set(block.id, currentReply);
        const group = ensureExecution(source);
        const state = getToolState(
          block.id,
          entry,
          results,
          toolExecutions,
          streamingEntry ? "streaming" : status,
          entry === streamingEntry || liveToolCallIds.has(block.id),
        );
        group.items.push({
          type: "tool",
          key: `tool:${block.id}`,
          source,
          toolCallId: block.id,
          name: block.name,
          args: isRecord(block.arguments) ? block.arguments : {},
          state,
        });
        group.counts[state.status] += 1;
      }
    }

    if (
      (message.stopReason === "error" || message.stopReason === "aborted") &&
      typeof message.errorMessage === "string" &&
      message.errorMessage
    ) {
      currentReply.parts.push({
        type: "error",
        key: `${entryKey}:error`,
        source: {
          key: entryKey,
          entry,
          streaming: entry === streamingEntry,
        },
        content: message.errorMessage,
        stopReason: message.stopReason,
      });
      execution = undefined;
    }
    if (message.stopReason === "aborted" || message.stopReason === "error") {
      for (const part of currentReply.parts) {
        if (part.type !== "execution") continue;
        for (const item of part.items) {
          if (
            item.type !== "tool" ||
            !["pending", "running", "unknown"].includes(item.state.status)
          )
            continue;
          part.counts[item.state.status] -= 1;
          item.state = { status: "aborted" };
          part.counts.aborted += 1;
        }
      }
    }
  }

  for (const item of items) {
    if (item.type === "reply") {
      item.parts = item.parts.filter(
        (part) => part.type !== "execution" || part.items.length > 0,
      );
    }
  }
  return items;
}
