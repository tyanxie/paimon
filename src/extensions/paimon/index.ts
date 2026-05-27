// Pi Extension 入口：连接 Hub、转发事件、接收指令

import { spawnSync } from "child_process";
import { hostname } from "os";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { DEFAULTS } from "../../protocol/types";
import type {
  HubToExtensionMessage,
  ExtHistoryMessage,
  ExtSessionListMessage,
  ContextUsageInfo,
  ModelInfo,
  ThinkingLevel,
} from "../../protocol/types";
import { HubClient } from "./client";
import { serializeEvent, FORWARDED_EVENTS } from "./serializer";
import * as sessionControlPatch from "./session_control_patch";

export default function (pi: ExtensionAPI) {
  const port = parseInt(process.env.PAIMON_PORT || String(DEFAULTS.PORT), 10);

  let registered = false;
  // 保存最新的 ctx 引用，用于响应 get_history
  let currentCtx: ExtensionContext | null = null;
  // 跟踪 compaction 状态（兜底用）
  let compacting = false;

  // 安装 session 控制 patch（截获 newSession/switchSession 函数引用）
  sessionControlPatch.install();

  const currentHostname = hostname();

  // 创建 Hub 客户端
  const client = new HubClient({
    port,
    onConnected() {
      // 连接成功后发送注册信息（优先用已缓存的 ctx）
      const ctx = currentCtx;
      client.send({
        type: "register",
        payload: {
          hostname: currentHostname,
          cwd: ctx?.cwd ?? process.cwd(),
          model: ctx?.model
            ? {
                provider: ctx.model.provider,
                id: ctx.model.id,
                name: ctx.model.name,
              }
            : { provider: "unknown", id: "unknown" },
          sessionId: ctx?.sessionManager?.getSessionId?.() ?? undefined,
          sessionName: ctx?.sessionManager?.getSessionFile?.() ?? undefined,
          pid: process.pid,
          availableModels: ctx ? getAvailableModels(ctx) : undefined,
          contextUsage: ctx ? getContextUsageInfo(ctx) : undefined,
          gitBranch: ctx
            ? (getGitBranch(ctx.cwd ?? process.cwd()) ?? undefined)
            : undefined,
          thinkingLevel: ctx?.model?.reasoning
            ? (pi.getThinkingLevel() as ThinkingLevel)
            : undefined,
        },
      });
    },
    onDisconnected() {
      registered = false;
    },
    onMessage(msg: HubToExtensionMessage) {
      if (msg.type === "registered") {
        registered = true;
      }
      handleHubMessage(pi, msg, client, () => currentCtx);
    },
  });

  // 启动连接
  client.connect();

  // 转发 pi 事件到 Hub
  for (const eventName of FORWARDED_EVENTS) {
    pi.on(eventName as any, async (event: any) => {
      if (!client.connected) return;
      // Copied from pi interactive-mode.js:
      // Normalize abort errorMessage before forwarding.
      // The TUI layer overwrites message.errorMessage after message_end fires,
      // but our handler runs before/concurrently, so we replicate the logic here.
      if (
        eventName === "message_end" &&
        event?.message?.stopReason === "aborted"
      ) {
        event = {
          ...event,
          message: {
            ...event.message,
            errorMessage: "Operation aborted",
          },
        };
      }
      client.send(serializeEvent(eventName, event));
    });
  }

  // 转发状态变更 + 更新注册信息（确保 model 正确）
  pi.on("agent_start", async (_event, ctx) => {
    currentCtx = ctx;
    // 兜底：如果之前卡在 compacting 状态，agent_start 时强制恢复
    compacting = false;
    if (ctx.model) {
      client.send({
        type: "register",
        payload: {
          hostname: currentHostname,
          cwd: ctx.cwd,
          model: {
            provider: ctx.model.provider,
            id: ctx.model.id,
            name: ctx.model.name,
          },
          sessionId: ctx.sessionManager.getSessionId() ?? undefined,
          sessionName: ctx.sessionManager.getSessionFile() ?? undefined,
          pid: process.pid,
          availableModels: getAvailableModels(ctx),
          thinkingLevel: ctx.model.reasoning
            ? (pi.getThinkingLevel() as ThinkingLevel)
            : undefined,
        },
      });
    }
    client.send({ type: "state", payload: { status: "streaming" } });
  });

  // 模型切换时同步给 Hub
  pi.on("model_select", async (event, ctx) => {
    currentCtx = ctx;
    if (!client.connected) return;
    client.send({
      type: "state",
      payload: {
        model: {
          provider: event.model.provider,
          id: event.model.id,
          name: event.model.name,
        },
        contextUsage: getContextUsageInfo(ctx),
        // 新模型支持 reasoning → 报告当前 level；否则 null 清除
        thinkingLevel: event.model.reasoning
          ? (pi.getThinkingLevel() as ThinkingLevel)
          : null,
      },
    });
  });

  // 思考等级切换时同步给 Hub
  pi.on("thinking_level_select", async (event) => {
    if (!client.connected) return;
    client.send({
      type: "state",
      payload: { thinkingLevel: event.level as ThinkingLevel },
    });
  });

  // 每次 message 结束时更新上下文使用情况 + git 分支
  pi.on("message_end", async (_event, ctx) => {
    currentCtx = ctx;
    if (!client.connected) return;
    client.send({
      type: "state",
      payload: {
        status: "streaming",
        contextUsage: getContextUsageInfo(ctx),
        gitBranch: getGitBranch(ctx.cwd),
      },
    });
  });

  pi.on("agent_end", async () => {
    const ctx = currentCtx;
    // 兜底：如果之前卡在 compacting 状态，agent_end 时强制恢复
    compacting = false;
    client.send({
      type: "state",
      payload: {
        status: "idle",
        contextUsage: ctx ? getContextUsageInfo(ctx) : undefined,
        gitBranch: ctx ? getGitBranch(ctx.cwd) : undefined,
      },
    });
    // 安全网：agent 结束后尝试执行 pending session 操作
    setTimeout(() => sessionControlPatch.flush(), 0);
  });

  // 压缩开始前：标记 compacting 状态
  pi.on("session_before_compact", async (event, ctx) => {
    currentCtx = ctx;
    compacting = true;
    if (!client.connected) return;
    client.send({
      type: "state",
      payload: { status: "compacting" },
    });
    // 监听取消信号（ESC），即时回退状态
    event.signal.addEventListener(
      "abort",
      () => {
        compacting = false;
        if (client.connected) {
          client.send({ type: "state", payload: { status: "idle" } });
        }
      },
      { once: true },
    );
  });

  // 压缩完成后更新上下文使用情况（tokens 会变为 null）
  pi.on("session_compact", async (_event, ctx) => {
    currentCtx = ctx;
    compacting = false;
    if (!client.connected) return;
    client.send({
      type: "state",
      payload: {
        status: ctx.isIdle() ? "idle" : "streaming",
        contextUsage: getContextUsageInfo(ctx),
      },
    });
  });

  // 心跳
  const heartbeatInterval = setInterval(() => {
    if (client.connected) {
      client.send({ type: "ping" });
    }
  }, DEFAULTS.HEARTBEAT_INTERVAL);

  // session_start 时发送更精确的注册信息 + 更新 ctx
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    if (client.connected && ctx.model) {
      client.send({
        type: "register",
        payload: {
          hostname: currentHostname,
          cwd: ctx.cwd,
          model: {
            provider: ctx.model.provider,
            id: ctx.model.id,
            name: ctx.model.name,
          },
          sessionId: ctx.sessionManager.getSessionId() ?? undefined,
          sessionName: ctx.sessionManager.getSessionFile() ?? undefined,
          pid: process.pid,
          availableModels: getAvailableModels(ctx),
          contextUsage: getContextUsageInfo(ctx),
          gitBranch: getGitBranch(ctx.cwd) ?? undefined,
          thinkingLevel: ctx.model.reasoning
            ? (pi.getThinkingLevel() as ThinkingLevel)
            : undefined,
        },
      });
    }
  });

  // 清理
  pi.on("session_shutdown", async () => {
    sessionControlPatch.clear();
    clearInterval(heartbeatInterval);
    client.disconnect();
  });
}

/** 处理 Hub 下发的指令 */
function handleHubMessage(
  pi: ExtensionAPI,
  msg: HubToExtensionMessage,
  client: HubClient,
  getCurrentCtx: () => any,
): void {
  switch (msg.type) {
    case "prompt":
      pi.sendUserMessage(msg.payload.message);
      break;
    case "steer":
      pi.sendUserMessage(msg.payload.message, { deliverAs: "steer" });
      break;
    case "abort": {
      const ctx = getCurrentCtx();
      ctx?.abort();
      break;
    }
    case "set_model": {
      const ctx = getCurrentCtx();
      if (ctx?.modelRegistry) {
        const model = ctx.modelRegistry.find(
          msg.payload.provider,
          msg.payload.id,
        );
        if (model) {
          pi.setModel(model).then((ok) => {
            if (ok) {
              ctx.ui?.notify(`Model: ${model.id}`, "info");
            }
          });
        }
      }
      break;
    }
    case "set_thinking_level": {
      pi.setThinkingLevel(msg.payload.level as any);
      break;
    }
    case "get_history": {
      const ctx = getCurrentCtx();
      if (ctx?.sessionManager) {
        try {
          const allEntries = ctx.sessionManager.getBranch();
          const offset = msg.payload?.offset ?? 0;
          const limit = msg.payload?.limit ?? 50;

          // 按 turn 分组：每个 role=user 的 message 开始一个新 turn
          const turns: unknown[][] = [];
          let currentTurn: unknown[] = [];
          for (const entry of allEntries) {
            const e = entry as { type?: string; message?: { role?: string } };
            if (
              e.type === "message" &&
              e.message?.role === "user" &&
              currentTurn.length > 0
            ) {
              turns.push(currentTurn);
              currentTurn = [];
            }
            currentTurn.push(entry);
          }
          if (currentTurn.length > 0) turns.push(currentTurn);

          // 从末尾往前取：跳过 offset 个 entries，取 limit 个 entries（turn 对齐）
          // 先将 turns 展平计算每个 turn 的 entry 数量
          let skipped = 0;
          let endTurnIdx = turns.length;
          // 从末尾跳过 offset 个 entries
          while (endTurnIdx > 0 && skipped < offset) {
            endTurnIdx--;
            skipped += turns[endTurnIdx].length;
          }

          // 从 endTurnIdx 往前取 limit 个 entries
          let collected = 0;
          let startTurnIdx = endTurnIdx;
          while (startTurnIdx > 0 && collected < limit) {
            startTurnIdx--;
            collected += turns[startTurnIdx].length;
          }

          const sliced = turns.slice(startTurnIdx, endTurnIdx).flat();
          const hasMore = startTurnIdx > 0;

          const response: ExtHistoryMessage = {
            type: "history",
            payload: { entries: sliced, hasMore },
          };
          client.send(response);
        } catch {
          // getBranch 失败时返回空列表
          client.send({
            type: "history",
            payload: { entries: [], hasMore: false },
          });
        }
      } else {
        client.send({
          type: "history",
          payload: { entries: [], hasMore: false },
        });
      }
      break;
    }
    case "pong":
    case "registered":
      break;
    case "list_sessions": {
      const ctx = getCurrentCtx();
      if (ctx?.cwd) {
        SessionManager.list(ctx.cwd)
          .then((sessions) => {
            const currentFile = (ctx.sessionManager as any).getSessionFile?.();
            const response: ExtSessionListMessage = {
              type: "session_list",
              payload: {
                sessions: sessions.map((s) => ({
                  path: s.path,
                  id: s.id,
                  name: s.name,
                  cwd: s.cwd,
                  created: s.created.toISOString(),
                  modified: s.modified.toISOString(),
                  messageCount: s.messageCount,
                  firstMessage: s.firstMessage.slice(0, 100),
                  isCurrent: s.path === currentFile,
                })),
              },
            };
            client.send(response);
          })
          .catch(() => {
            client.send({ type: "session_list", payload: { sessions: [] } });
          });
      } else {
        client.send({ type: "session_list", payload: { sessions: [] } });
      }
      break;
    }
    case "new_session":
      sessionControlPatch.scheduleNew();
      break;
    case "switch_session":
      sessionControlPatch.scheduleSwitch(msg.payload.path);
      break;
    case "compact": {
      const ctx = getCurrentCtx();
      if (ctx && ctx.isIdle()) {
        ctx.compact({
          customInstructions: msg.payload?.customInstructions,
        });
      }
      break;
    }
  }
}

/** 从 ctx 获取上下文使用信息 */
function getContextUsageInfo(ctx: any): ContextUsageInfo | undefined {
  const usage = ctx.getContextUsage?.();
  if (!usage) return undefined;
  return {
    tokens: usage.tokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent,
  };
}

/** 获取当前 git 分支名 */
function getGitBranch(cwd: string): string | null {
  try {
    const result = spawnSync(
      "git",
      ["--no-optional-locks", "symbolic-ref", "--quiet", "--short", "HEAD"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return result.status === 0 ? result.stdout.trim() || null : null;
  } catch {
    return null;
  }
}

/** 获取可用模型列表 */
function getAvailableModels(ctx: any): ModelInfo[] {
  try {
    const models = ctx.modelRegistry?.getAvailable?.() ?? [];
    return models.map((m: any) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
    }));
  } catch {
    return [];
  }
}
