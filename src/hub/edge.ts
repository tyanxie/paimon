// Edge 注册表：管理已连接的 Edge 节点及其实例
//
// Hub 不再直接持有 pi extension 的 WebSocket，而是通过 Edge 间接管理。
// 每个 Edge 通过单条 WS 连接 Hub，Hub 通过该连接路由所有指令。

import type { ServerWebSocket } from "bun";
import { randomUUID } from "node:crypto";
import type {
  InstanceId,
  InstanceInfo,
  InstanceStatus,
  ModelInfo,
  ContextUsageInfo,
  ThinkingLevel,
  EdgeInfo,
  BrowseEntry,
  BrowseResult,
} from "../protocol/types";
import { DEFAULTS } from "../protocol/types";
import { PendingRequests } from "./pending";
import * as log from "./logger";

/** Edge WebSocket 上下文数据 */
export interface EdgeWsData {
  role: "edge";
  edgeId?: string;
}

/** Browser WebSocket 上下文数据 */
export interface BrowserWsData {
  role: "browser";
  browserId?: string;
  subscriptions?: Set<InstanceId>;
}

/** 统一的 WsData（用于 Bun.serve 泛型） */
export type WsData = EdgeWsData | BrowserWsData;

/** Edge 注册记录 */
interface EdgeRecord {
  info: EdgeInfo;
  ws: ServerWebSocket<WsData> | null;
  /** 心跳超时定时器 */
  heartbeatTimer?: Timer;
  /** 断连 grace period 定时器 */
  graceTimer?: Timer;
}

/** 实例记录（不再持有 pi ws，仅存储元数据 + 所属 edgeId） */
interface InstanceRecord {
  info: InstanceInfo;
}

class HubEdgeRegistry {
  private edges = new Map<string, EdgeRecord>();
  private instances = new Map<InstanceId, InstanceRecord>();
  private browserClients = new Set<ServerWebSocket<WsData>>();
  private browserHeartbeatTimers = new Map<ServerWebSocket<WsData>, Timer>();
  /** spawn token → pending 记录 */
  private pendingSpawns = new PendingRequests<InstanceId>();
  /** browse token → pending 记录 */
  private pendingBrowses = new PendingRequests<BrowseResult>();

  // ─── Edge 管理 ───

  /** 注册 Edge */
  registerEdge(
    ws: ServerWebSocket<WsData>,
    edgeId: string,
    hostname: string,
    homedir: string,
  ): EdgeInfo {
    const now = Date.now();
    const existing = this.edges.get(edgeId);

    if (existing) {
      // Edge 重连：取消 grace timer
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = undefined;
      }
      if (existing.ws && existing.ws !== ws) {
        existing.ws.close(1000, "Replaced by new connection");
      }

      existing.ws = ws;
      existing.info.hostname = hostname;
      existing.info.homedir = homedir;
      existing.info.lastHeartbeat = now;

      if (existing.heartbeatTimer) clearTimeout(existing.heartbeatTimer);
      existing.heartbeatTimer = this.startEdgeHeartbeatTimer(edgeId);

      const wsData = ws.data as EdgeWsData;
      wsData.edgeId = edgeId;

      log.info(`Edge reconnected: ${edgeId} (hostname: ${hostname})`);

      return existing.info;
    }

    // 全新 Edge
    const info: EdgeInfo = {
      edgeId,
      hostname,
      homedir,
      connectedAt: now,
      lastHeartbeat: now,
    };

    const heartbeatTimer = this.startEdgeHeartbeatTimer(edgeId);
    this.edges.set(edgeId, { info, ws, heartbeatTimer });
    const wsData = ws.data as EdgeWsData;
    wsData.edgeId = edgeId;

    log.info(`Edge registered: ${edgeId} (hostname: ${hostname})`);

    return info;
  }

  /** Edge 断连，启动 grace period（该 edge 下所有 instance 一并处理） */
  startEdgeGracePeriod(edgeId: string): void {
    const record = this.edges.get(edgeId);
    if (!record) return;
    if (record.graceTimer) return;

    record.ws = null;
    if (record.heartbeatTimer) {
      clearTimeout(record.heartbeatTimer);
      record.heartbeatTimer = undefined;
    }

    log.info(
      `Edge ${edgeId} disconnected, grace period ${DEFAULTS.DISCONNECT_GRACE_PERIOD}ms`,
    );

    record.graceTimer = setTimeout(() => {
      record.graceTimer = undefined;
      // 移除该 edge 下所有 instance
      const removedInstances: InstanceInfo[] = [];
      for (const [id, inst] of this.instances) {
        if (inst.info.edgeId === edgeId) {
          removedInstances.push(inst.info);
          this.instances.delete(id);
        }
      }
      this.edges.delete(edgeId);
      log.info(
        `Edge ${edgeId} removed after grace period (${removedInstances.length} instances removed)`,
      );

      // 通知浏览器实例下线
      for (const inst of removedInstances) {
        this.broadcastToBrowsers({
          type: "instance_update",
          payload: { instance: inst, action: "disconnected" },
        });
      }
    }, DEFAULTS.DISCONNECT_GRACE_PERIOD);
  }

  /** Edge 心跳更新 */
  edgeHeartbeat(edgeId: string): void {
    const record = this.edges.get(edgeId);
    if (!record) return;
    record.info.lastHeartbeat = Date.now();
    if (record.heartbeatTimer) clearTimeout(record.heartbeatTimer);
    record.heartbeatTimer = this.startEdgeHeartbeatTimer(edgeId);
  }

  /** 获取 Edge 的 WebSocket */
  getEdgeWs(edgeId: string): ServerWebSocket<WsData> | undefined {
    return this.edges.get(edgeId)?.ws ?? undefined;
  }

  /** 获取所有 Edge 信息 */
  getAllEdges(): EdgeInfo[] {
    return Array.from(this.edges.values()).map((r) => r.info);
  }

  /** 通过 ws 查找 edgeId */
  findEdgeByWs(ws: ServerWebSocket<WsData>): string | undefined {
    return (ws.data as EdgeWsData).edgeId;
  }

  // ─── Instance 管理（通过 Edge 间接管理） ───

  /** 注册实例（Edge 上报） */
  registerInstance(
    edgeId: string,
    instanceId: InstanceId,
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
    const now = Date.now();
    const existing = this.instances.get(instanceId);

    if (existing) {
      // 更新现有实例
      existing.info.edgeId = edgeId;
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

      log.info(
        `Instance updated: ${instanceId} (edge: ${edgeId}, pid: ${payload.pid})`,
      );

      this.broadcastToBrowsers({
        type: "instance_update",
        payload: { instance: existing.info, action: "updated" },
      });

      return existing.info;
    }

    // 全新实例
    const info: InstanceInfo = {
      id: instanceId,
      edgeId,
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

    this.instances.set(instanceId, { info });

    log.info(
      `Instance registered: ${instanceId} (edge: ${edgeId}, pid: ${payload.pid}, cwd: ${payload.cwd})`,
    );

    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: info, action: "connected" },
    });

    return info;
  }

  /** 注销实例（Edge 上报 quit） */
  unregisterInstance(instanceId: InstanceId): void {
    const record = this.instances.get(instanceId);
    if (!record) return;

    this.instances.delete(instanceId);
    log.info(`Instance unregistered: ${instanceId}`);

    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: record.info, action: "disconnected" },
    });
  }

  /** 更新实例状态（Edge 转发） */
  updateInstanceState(
    instanceId: InstanceId,
    state: {
      status?: InstanceStatus;
      contextUsage?: ContextUsageInfo;
      gitBranch?: string | null;
      model?: ModelInfo;
      thinkingLevel?: ThinkingLevel | null;
    },
  ): void {
    const record = this.instances.get(instanceId);
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

    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: record.info, action: "updated" },
    });
  }

  /** 获取实例所属的 edgeId */
  getInstanceEdgeId(instanceId: InstanceId): string | undefined {
    return this.instances.get(instanceId)?.info.edgeId;
  }

  /** 获取实例信息 */
  getInstance(instanceId: InstanceId): InstanceInfo | undefined {
    return this.instances.get(instanceId)?.info;
  }

  /** 获取所有实例列表 */
  getAllInstances(): InstanceInfo[] {
    return Array.from(this.instances.values()).map((r) => r.info);
  }

  // ─── Spawn 管理（使用通用 PendingRequests） ───

  /** 注册 pending spawn（Hub 向 Edge 发出 spawn 后等待结果） */
  registerPendingSpawn(token: string): Promise<InstanceId> {
    // Hub 侧超时比 Edge 侧多 3s 余量，确保 Edge 先超时并上报 error
    const timeout = DEFAULTS.SPAWN_REGISTER_TIMEOUT + 3_000;
    return this.pendingSpawns.register(
      token,
      timeout,
      `Spawn timed out (${timeout / 1000}s)`,
    );
  }

  /** Edge 回报 spawn 结果 */
  resolveSpawn(token: string, instanceId?: InstanceId, error?: string): void {
    if (error) {
      this.pendingSpawns.reject(token, error);
    } else if (instanceId) {
      this.pendingSpawns.resolve(token, instanceId);
    } else {
      this.pendingSpawns.reject(token, "Spawn result missing instanceId");
    }
  }

  // ─── Browse 管理（使用通用 PendingRequests） ───

  /** 注册 pending browse 请求 */
  registerPendingBrowse(token: string): Promise<BrowseResult> {
    return this.pendingBrowses.register(
      token,
      DEFAULTS.BROWSE_TIMEOUT,
      `Browse timed out (${DEFAULTS.BROWSE_TIMEOUT / 1000}s)`,
    );
  }

  /** Edge 回报 browse 结果 */
  resolveBrowse(
    token: string,
    result?: { parent: string; entries: BrowseEntry[]; truncated: boolean },
    error?: string,
  ): void {
    if (error) {
      this.pendingBrowses.reject(token, error);
    } else if (result) {
      this.pendingBrowses.resolve(token, result);
    } else {
      this.pendingBrowses.reject(token, "Browse result missing data");
    }
  }

  // ─── Browser 管理 ───

  addBrowser(ws: ServerWebSocket<WsData>): void {
    const id = randomUUID();
    const wsData = ws.data as BrowserWsData;
    wsData.browserId = id;
    this.browserClients.add(ws);
    wsData.subscriptions = new Set();
    this.startBrowserHeartbeatTimer(ws);
    log.info(`Browser ${id} connected (total: ${this.browserClients.size})`);
  }

  removeBrowser(ws: ServerWebSocket<WsData>): void {
    this.clearBrowserHeartbeatTimer(ws);
    this.browserClients.delete(ws);
    const wsData = ws.data as BrowserWsData;
    log.info(
      `Browser ${wsData.browserId} disconnected (total: ${this.browserClients.size})`,
    );
  }

  browserHeartbeat(ws: ServerWebSocket<WsData>): void {
    this.clearBrowserHeartbeatTimer(ws);
    this.startBrowserHeartbeatTimer(ws);
  }

  getSubscribers(instanceId: InstanceId): ServerWebSocket<WsData>[] {
    const result: ServerWebSocket<WsData>[] = [];
    for (const ws of this.browserClients) {
      const wsData = ws.data as BrowserWsData;
      if (wsData.subscriptions?.has(instanceId)) {
        result.push(ws);
      }
    }
    return result;
  }

  broadcastToBrowsers(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const ws of this.browserClients) {
      ws.send(payload);
    }
  }

  // ─── 私有方法 ───

  private startEdgeHeartbeatTimer(edgeId: string): Timer {
    return setTimeout(() => {
      const record = this.edges.get(edgeId);
      if (record) {
        log.warn(`Edge ${edgeId} heartbeat timeout, disconnecting`);
        if (record.ws) {
          record.ws.close(1001, "Heartbeat timeout");
        }
        // 直接进入 grace period 而非立即删除
        this.startEdgeGracePeriod(edgeId);
      }
    }, DEFAULTS.HEARTBEAT_INTERVAL + DEFAULTS.HEARTBEAT_TIMEOUT);
  }

  private startBrowserHeartbeatTimer(ws: ServerWebSocket<WsData>): void {
    const timer = setTimeout(() => {
      const wsData = ws.data as BrowserWsData;
      log.warn(`Browser ${wsData.browserId} heartbeat timeout, disconnecting`);
      this.browserHeartbeatTimers.delete(ws);
      ws.close(1001, "Heartbeat timeout");
      this.browserClients.delete(ws);
    }, DEFAULTS.HEARTBEAT_INTERVAL + DEFAULTS.HEARTBEAT_TIMEOUT);
    this.browserHeartbeatTimers.set(ws, timer);
  }

  private clearBrowserHeartbeatTimer(ws: ServerWebSocket<WsData>): void {
    const timer = this.browserHeartbeatTimers.get(ws);
    if (timer) {
      clearTimeout(timer);
      this.browserHeartbeatTimers.delete(ws);
    }
  }
}

// 单例
export const hubRegistry = new HubEdgeRegistry();
