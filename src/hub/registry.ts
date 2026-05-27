// 实例注册表：管理已连接的 pi 实例

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
import * as log from "./logger";

/** WebSocket 上下文附加数据 */
export interface WsData {
  /** 连接类型 */
  role: "extension" | "browser";
  /** 实例 ID（extension 连接才有） */
  instanceId?: InstanceId;
  /** 浏览器连接 ID（browser 连接才有） */
  browserId?: string;
  /** 浏览器订阅的实例列表 */
  subscriptions?: Set<InstanceId>;
}

/** 实例注册记录 */
interface InstanceRecord {
  info: InstanceInfo;
  /** 对应的 WebSocket 连接（grace period 期间可能为 null） */
  ws: ServerWebSocket<WsData> | null;
  /** 心跳超时定时器 */
  heartbeatTimer?: Timer;
  /** 断连 grace period 定时器 */
  graceTimer?: Timer;
}

/** 根据 hostname + pid 计算确定性 InstanceId */
function computeInstanceId(hostname: string, pid: number): InstanceId {
  return createHash("md5").update(`${hostname}:${pid}`).digest("hex");
}

class Registry {
  private instances = new Map<InstanceId, InstanceRecord>();
  private browserClients = new Set<ServerWebSocket<WsData>>();
  /** 浏览器连接心跳超时定时器 */
  private browserHeartbeatTimers = new Map<ServerWebSocket<WsData>, Timer>();

  /** 注册实例（新注册或重连复用） */
  register(
    ws: ServerWebSocket<WsData>,
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
  ): InstanceInfo {
    const id = computeInstanceId(payload.hostname, payload.pid);
    const now = Date.now();
    const existing = this.instances.get(id);

    if (existing) {
      // 同一实例重连或更新：取消 grace timer，替换 ws，更新信息
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = undefined;
      }

      // 如果旧 ws 不同于新 ws，关闭旧连接
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

      // 重置心跳
      if (existing.heartbeatTimer) clearTimeout(existing.heartbeatTimer);
      existing.heartbeatTimer = this.startHeartbeatTimer(id);

      ws.data.instanceId = id;

      log.info(
        `Instance reconnected: ${id} (pid: ${payload.pid}, model: ${payload.model.provider}/${payload.model.id})`,
      );

      this.broadcastToBrowsers({
        type: "instance_update",
        payload: { instance: existing.info, action: "updated" },
      });

      return existing.info;
    }

    // 全新实例
    const info: InstanceInfo = {
      id,
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

    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: info, action: "connected" },
    });

    return info;
  }

  /** ws 断开时启动 grace period，超时后注销 */
  startGracePeriod(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;
    // 已在 grace period 中，不重复启动
    if (record.graceTimer) return;

    // 标记 ws 为空
    record.ws = null;

    // 清除心跳定时器（断连后无需检测心跳）
    if (record.heartbeatTimer) {
      clearTimeout(record.heartbeatTimer);
      record.heartbeatTimer = undefined;
    }

    log.info(
      `Instance ${id} disconnected, grace period ${DEFAULTS.DISCONNECT_GRACE_PERIOD}ms`,
    );

    record.graceTimer = setTimeout(() => {
      record.graceTimer = undefined;
      // grace period 过期，真正移除
      this.instances.delete(id);
      log.info(`Instance ${id} removed after grace period`);
      this.broadcastToBrowsers({
        type: "instance_update",
        payload: { instance: record.info, action: "disconnected" },
      });
    }, DEFAULTS.DISCONNECT_GRACE_PERIOD);
  }

  /** 立即注销实例（心跳超时等强制场景） */
  unregister(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;

    if (record.heartbeatTimer) clearTimeout(record.heartbeatTimer);
    if (record.graceTimer) clearTimeout(record.graceTimer);

    this.instances.delete(id);
    log.info(`Instance unregistered: ${id}`);

    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: record.info, action: "disconnected" },
    });
  }

  /** 更新心跳 */
  heartbeat(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;

    record.info.lastHeartbeat = Date.now();

    // 重置心跳超时
    if (record.heartbeatTimer) {
      clearTimeout(record.heartbeatTimer);
    }
    record.heartbeatTimer = this.startHeartbeatTimer(id);
  }

  /** 更新实例状态 */
  updateState(
    id: InstanceId,
    state: {
      status?: InstanceStatus;
      contextUsage?: {
        tokens: number | null;
        contextWindow: number;
        percent: number | null;
      };
      gitBranch?: string | null;
      model?: ModelInfo;
      thinkingLevel?: ThinkingLevel | null;
    },
  ): void {
    const record = this.instances.get(id);
    if (!record) return;

    if (state.status !== undefined) {
      record.info.status = state.status;
    }
    if (state.contextUsage !== undefined) {
      record.info.contextUsage = state.contextUsage;
    }
    if (state.gitBranch !== undefined) {
      record.info.gitBranch = state.gitBranch;
    }
    if (state.model !== undefined) {
      record.info.model = state.model;
    }
    if (state.thinkingLevel !== undefined) {
      // null 表示清除（模型不支持 reasoning）
      record.info.thinkingLevel =
        state.thinkingLevel === null ? undefined : state.thinkingLevel;
    }

    // 通知浏览器
    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: record.info, action: "updated" },
    });
  }

  /** 获取实例的 WebSocket（grace period 期间返回 undefined） */
  getInstanceWs(id: InstanceId): ServerWebSocket<WsData> | undefined {
    return this.instances.get(id)?.ws ?? undefined;
  }

  /** 获取实例信息 */
  getInstance(id: InstanceId): InstanceInfo | undefined {
    return this.instances.get(id)?.info;
  }

  /** 获取所有实例列表 */
  getAllInstances(): InstanceInfo[] {
    return Array.from(this.instances.values()).map((r) => r.info);
  }

  /** 注册浏览器连接 */
  addBrowser(ws: ServerWebSocket<WsData>): void {
    const id = crypto.randomUUID();
    ws.data.browserId = id;
    this.browserClients.add(ws);
    ws.data.subscriptions = new Set();
    this.startBrowserHeartbeatTimer(ws);
    log.info(`Browser ${id} connected (total: ${this.browserClients.size})`);
  }

  /** 移除浏览器连接 */
  removeBrowser(ws: ServerWebSocket<WsData>): void {
    this.clearBrowserHeartbeatTimer(ws);
    this.browserClients.delete(ws);
    log.info(
      `Browser ${ws.data.browserId} disconnected (total: ${this.browserClients.size})`,
    );
  }

  /** 浏览器心跳更新 */
  browserHeartbeat(ws: ServerWebSocket<WsData>): void {
    this.clearBrowserHeartbeatTimer(ws);
    this.startBrowserHeartbeatTimer(ws);
  }

  /** 获取订阅了指定实例的所有浏览器 */
  getSubscribers(instanceId: InstanceId): ServerWebSocket<WsData>[] {
    const result: ServerWebSocket<WsData>[] = [];
    for (const ws of this.browserClients) {
      if (ws.data.subscriptions?.has(instanceId)) {
        result.push(ws);
      }
    }
    return result;
  }

  /** 向所有浏览器广播 */
  broadcastToBrowsers(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const ws of this.browserClients) {
      ws.send(payload);
    }
  }

  /** 通过 WebSocket 连接查找实例 ID */
  findInstanceByWs(ws: ServerWebSocket<WsData>): InstanceId | undefined {
    return ws.data.instanceId;
  }

  /** 启动实例心跳超时定时器 */
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

  /** 启动浏览器心跳超时定时器 */
  private startBrowserHeartbeatTimer(ws: ServerWebSocket<WsData>): void {
    const timer = setTimeout(() => {
      log.warn(`Browser ${ws.data.browserId} heartbeat timeout, disconnecting`);
      this.browserHeartbeatTimers.delete(ws);
      ws.close(1001, "Heartbeat timeout");
      this.browserClients.delete(ws);
    }, DEFAULTS.HEARTBEAT_INTERVAL + DEFAULTS.HEARTBEAT_TIMEOUT);
    this.browserHeartbeatTimers.set(ws, timer);
  }

  /** 清除浏览器心跳定时器 */
  private clearBrowserHeartbeatTimer(ws: ServerWebSocket<WsData>): void {
    const timer = this.browserHeartbeatTimers.get(ws);
    if (timer) {
      clearTimeout(timer);
      this.browserHeartbeatTimers.delete(ws);
    }
  }
}

// 单例
export const registry = new Registry();
