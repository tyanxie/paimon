// Edge 本地实例注册表：管理本机连接的 pi 实例
//
// 与 Hub 的 registry 不同，Edge registry 直接持有 pi 的 WebSocket 连接。
// Edge 作为 pi 的"本地 Hub"，负责心跳检测和 grace period。

import { createHash } from "crypto";
import type { ServerWebSocket } from "bun";
import type {
  InstanceId,
  InstanceInfo,
  InstanceStatus,
  ModelInfo,
  ContextUsageInfo,
  ThinkingLevel,
} from "../protocol/types";
import { DEFAULTS } from "../protocol/types";
import { edgeId } from "./config";
import * as log from "./logger";

/** WebSocket 上下文附加数据 */
export interface EdgeWsData {
  /** 实例 ID（注册后赋值） */
  instanceId?: InstanceId;
}

/** 实例注册记录 */
interface InstanceRecord {
  info: InstanceInfo;
  ws: ServerWebSocket<EdgeWsData> | null;
  heartbeatTimer?: Timer;
  graceTimer?: Timer;
}

/** 根据 hostname + pid 计算确定性 InstanceId */
function computeInstanceId(hostname: string, pid: number): InstanceId {
  return createHash("md5").update(`${hostname}:${pid}`).digest("hex");
}

export type InstanceChangeCallback = (
  event: "registered" | "updated" | "unregistered",
  instanceId: InstanceId,
  info?: InstanceInfo,
) => void;

class EdgeRegistry {
  private instances = new Map<InstanceId, InstanceRecord>();
  private onChange: InstanceChangeCallback | null = null;
  /** 本 Edge 的标识 */
  readonly edgeId: string;

  constructor(edgeId: string) {
    this.edgeId = edgeId;
  }

  /** 设置变更回调（upstream 用于同步到 Hub） */
  setChangeCallback(cb: InstanceChangeCallback): void {
    this.onChange = cb;
  }

  /** 注册实例（新注册或重连复用） */
  register(
    ws: ServerWebSocket<EdgeWsData>,
    payload: {
      hostname: string;
      cwd: string;
      model: ModelInfo;
      sessionId?: string;
      sessionName?: string;
      pid: number;
      availableModels?: ModelInfo[];
      contextUsage?: ContextUsageInfo;
      gitBranch?: string;
      thinkingLevel?: ThinkingLevel;
    },
  ): { instanceId: InstanceId; isReconnect: boolean } {
    const id = computeInstanceId(payload.hostname, payload.pid);
    const now = Date.now();
    const existing = this.instances.get(id);

    if (existing) {
      // 重连：取消 grace timer，替换 ws
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = undefined;
      }
      if (existing.ws && existing.ws !== ws) {
        existing.ws.close(1000, "Replaced by new connection");
      }

      existing.ws = ws;
      existing.info.hostname = payload.hostname;
      existing.info.cwd = payload.cwd;
      existing.info.model = payload.model;
      existing.info.sessionId = payload.sessionId;
      existing.info.sessionName = payload.sessionName;
      existing.info.pid = payload.pid;
      existing.info.availableModels = payload.availableModels;
      existing.info.contextUsage = payload.contextUsage;
      existing.info.gitBranch = payload.gitBranch;
      existing.info.thinkingLevel = payload.thinkingLevel;
      existing.info.lastHeartbeat = now;

      if (existing.heartbeatTimer) clearTimeout(existing.heartbeatTimer);
      existing.heartbeatTimer = this.startHeartbeatTimer(id);

      ws.data.instanceId = id;

      log.info(
        `Instance reconnected: ${id} (pid: ${payload.pid}, model: ${payload.model.provider}/${payload.model.id})`,
      );

      this.onChange?.("registered", id, existing.info);
      return { instanceId: id, isReconnect: true };
    }

    // 全新实例
    const info: InstanceInfo = {
      id,
      edgeId: this.edgeId,
      hostname: payload.hostname,
      cwd: payload.cwd,
      model: payload.model,
      sessionId: payload.sessionId,
      sessionName: payload.sessionName,
      pid: payload.pid,
      status: "idle",
      availableModels: payload.availableModels,
      contextUsage: payload.contextUsage,
      gitBranch: payload.gitBranch,
      thinkingLevel: payload.thinkingLevel,
      connectedAt: now,
      lastHeartbeat: now,
    };

    const heartbeatTimer = this.startHeartbeatTimer(id);
    this.instances.set(id, { info, ws, heartbeatTimer });
    ws.data.instanceId = id;

    log.info(
      `Instance registered: ${id} (pid: ${payload.pid}, cwd: ${payload.cwd}, model: ${payload.model.provider}/${payload.model.id})`,
    );

    this.onChange?.("registered", id, info);
    return { instanceId: id, isReconnect: false };
  }

  /** ws 断开时启动 grace period */
  startGracePeriod(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;
    if (record.graceTimer) return;

    record.ws = null;
    if (record.heartbeatTimer) {
      clearTimeout(record.heartbeatTimer);
      record.heartbeatTimer = undefined;
    }

    log.info(
      `Instance ${id} disconnected, grace period ${DEFAULTS.DISCONNECT_GRACE_PERIOD}ms`,
    );

    record.graceTimer = setTimeout(() => {
      record.graceTimer = undefined;
      this.instances.delete(id);
      log.info(`Instance ${id} removed after grace period`);
      this.onChange?.("unregistered", id, record.info);
    }, DEFAULTS.DISCONNECT_GRACE_PERIOD);
  }

  /** 立即注销实例 */
  unregister(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;

    if (record.heartbeatTimer) clearTimeout(record.heartbeatTimer);
    if (record.graceTimer) clearTimeout(record.graceTimer);

    this.instances.delete(id);
    log.info(`Instance unregistered: ${id}`);
    this.onChange?.("unregistered", id, record.info);
  }

  /** 更新心跳 */
  heartbeat(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;
    record.info.lastHeartbeat = Date.now();
    if (record.heartbeatTimer) clearTimeout(record.heartbeatTimer);
    record.heartbeatTimer = this.startHeartbeatTimer(id);
  }

  /** 更新实例状态 */
  updateState(
    id: InstanceId,
    state: {
      status?: InstanceStatus;
      contextUsage?: ContextUsageInfo;
      gitBranch?: string | null;
      model?: ModelInfo;
      thinkingLevel?: ThinkingLevel | null;
    },
  ): void {
    const record = this.instances.get(id);
    if (!record) return;

    if (state.status !== undefined) record.info.status = state.status;
    if (state.contextUsage !== undefined)
      record.info.contextUsage = state.contextUsage;
    if (state.gitBranch !== undefined) record.info.gitBranch = state.gitBranch;
    if (state.model !== undefined) record.info.model = state.model;
    if (state.thinkingLevel !== undefined) {
      record.info.thinkingLevel =
        state.thinkingLevel === null ? undefined : state.thinkingLevel;
    }

    this.onChange?.("updated", id, record.info);
  }

  /** 获取实例 WebSocket */
  getInstanceWs(id: InstanceId): ServerWebSocket<EdgeWsData> | undefined {
    return this.instances.get(id)?.ws ?? undefined;
  }

  /** 获取实例信息 */
  getInstance(id: InstanceId): InstanceInfo | undefined {
    return this.instances.get(id)?.info;
  }

  /** 获取所有实例 */
  getAllInstances(): InstanceInfo[] {
    return Array.from(this.instances.values()).map((r) => r.info);
  }

  /** 通过 ws 查找实例 ID */
  findInstanceByWs(ws: ServerWebSocket<EdgeWsData>): InstanceId | undefined {
    return ws.data.instanceId;
  }

  /** 启动心跳超时定时器 */
  private startHeartbeatTimer(id: InstanceId): Timer {
    return setTimeout(() => {
      const record = this.instances.get(id);
      if (record) {
        log.warn(`Instance ${id} heartbeat timeout, disconnecting`);
        if (record.ws) {
          record.ws.close(1001, "Heartbeat timeout");
        }
        this.unregister(id);
      }
    }, DEFAULTS.HEARTBEAT_INTERVAL + DEFAULTS.HEARTBEAT_TIMEOUT);
  }
}

// 单例
export const edgeRegistry = new EdgeRegistry(edgeId);
