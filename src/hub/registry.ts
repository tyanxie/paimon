// 实例注册表：管理已连接的 pi 实例

import type { ServerWebSocket } from "bun";
import type { InstanceId, InstanceInfo } from "../protocol/types";
import { DEFAULTS } from "../protocol/types";
import * as log from "./logger";

/** WebSocket 上下文附加数据 */
export interface WsData {
  /** 连接类型 */
  role: "extension" | "browser";
  /** 实例 ID（extension 连接才有） */
  instanceId?: InstanceId;
  /** 浏览器订阅的实例列表 */
  subscriptions?: Set<InstanceId>;
}

/** 实例注册记录 */
interface InstanceRecord {
  info: InstanceInfo;
  /** 对应的 WebSocket 连接 */
  ws: ServerWebSocket<WsData>;
  /** 心跳超时定时器 */
  heartbeatTimer?: Timer;
}

class Registry {
  private instances = new Map<InstanceId, InstanceRecord>();
  private browserClients = new Set<ServerWebSocket<WsData>>();
  private nextId = 1;

  /** 生成唯一实例 ID */
  private generateId(): InstanceId {
    return `pi-${this.nextId++}-${Date.now().toString(36)}`;
  }

  /** 注册新实例 */
  register(
    ws: ServerWebSocket<WsData>,
    payload: {
      cwd: string;
      model: { provider: string; id: string };
      sessionName?: string;
      pid: number;
    },
  ): InstanceInfo {
    const id = this.generateId();
    const now = Date.now();

    const info: InstanceInfo = {
      id,
      cwd: payload.cwd,
      model: payload.model,
      sessionName: payload.sessionName,
      pid: payload.pid,
      status: "idle",
      connectedAt: now,
      lastHeartbeat: now,
    };

    // 设置心跳超时
    const heartbeatTimer = this.startHeartbeatTimer(id);

    this.instances.set(id, { info, ws, heartbeatTimer });
    ws.data.instanceId = id;

    log.info(
      `Instance registered: ${id} (cwd: ${payload.cwd}, model: ${payload.model.provider}/${payload.model.id})`,
    );

    // 通知所有浏览器
    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: info, action: "connected" },
    });

    return info;
  }

  /** 注销实例 */
  unregister(id: InstanceId): void {
    const record = this.instances.get(id);
    if (!record) return;

    if (record.heartbeatTimer) {
      clearTimeout(record.heartbeatTimer);
    }

    this.instances.delete(id);
    log.info(`Instance unregistered: ${id}`);

    // 通知所有浏览器
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
    state: { status: "idle" | "streaming"; contextUsage?: number },
  ): void {
    const record = this.instances.get(id);
    if (!record) return;

    record.info.status = state.status;

    // 通知浏览器
    this.broadcastToBrowsers({
      type: "instance_update",
      payload: { instance: record.info, action: "updated" },
    });
  }

  /** 获取实例的 WebSocket */
  getInstanceWs(id: InstanceId): ServerWebSocket<WsData> | undefined {
    return this.instances.get(id)?.ws;
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
    this.browserClients.add(ws);
    ws.data.subscriptions = new Set();
    log.debug(`Browser connected (total: ${this.browserClients.size})`);
  }

  /** 移除浏览器连接 */
  removeBrowser(ws: ServerWebSocket<WsData>): void {
    this.browserClients.delete(ws);
    log.debug(`Browser disconnected (total: ${this.browserClients.size})`);
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

  /** 启动心跳超时定时器 */
  private startHeartbeatTimer(id: InstanceId): Timer {
    return setTimeout(() => {
      const record = this.instances.get(id);
      if (record) {
        log.warn(`Instance ${id} heartbeat timeout, disconnecting`);
        record.ws.close(1001, "Heartbeat timeout");
        this.unregister(id);
      }
    }, DEFAULTS.HEARTBEAT_INTERVAL + DEFAULTS.HEARTBEAT_TIMEOUT);
  }
}

// 单例
export const registry = new Registry();
