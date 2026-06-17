// Edge 上游客户端：连接 Hub 的 WebSocket 客户端
//
// Edge 通过单条 WS 与 Hub 通信，多路复用所有本地 pi 实例的消息。
// 连接成功后注册 Edge 自身，然后上报所有已注册的本地实例。

import type { EdgeToHubMessage, HubToEdgeMessage } from "../protocol/types";
import { DEFAULTS } from "../protocol/types";
import * as log from "./logger";

export type UpstreamMessageHandler = (msg: HubToEdgeMessage) => void;
export type UpstreamConnectionHandler = () => void;

export class UpstreamClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectIndex = 0;
  private reconnectTimer: Timer | null = null;
  private onMessage: UpstreamMessageHandler;
  private onConnected: UpstreamConnectionHandler;
  private onDisconnected: UpstreamConnectionHandler;
  private shouldReconnect = true;
  private _connected = false;

  constructor(options: {
    hubUrl: string;
    accessToken?: string;
    onMessage: UpstreamMessageHandler;
    onConnected: UpstreamConnectionHandler;
    onDisconnected: UpstreamConnectionHandler;
  }) {
    // hubUrl 可能是 ws://host:port 或 ws://host:port/ws/edge
    // 确保路径正确，并附带 token query 参数
    const base = options.hubUrl.replace(/\/$/, "");
    const wsPath = base.endsWith("/ws/edge") ? base : `${base}/ws/edge`;
    if (options.accessToken) {
      const urlObj = new URL(wsPath);
      urlObj.searchParams.set("token", options.accessToken);
      this.url = urlObj.toString();
    } else {
      this.url = wsPath;
    }
    this.onMessage = options.onMessage;
    this.onConnected = options.onConnected;
    this.onDisconnected = options.onDisconnected;
  }

  get connected(): boolean {
    return this._connected;
  }

  /** 发起连接 */
  connect(): void {
    this.shouldReconnect = true;
    this.doConnect();
  }

  /** 断开连接，不重连 */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, "Edge shutting down");
      this.ws = null;
    }
    this._connected = false;
  }

  /** 发送消息给 Hub */
  send(msg: EdgeToHubMessage): void {
    if (this.ws && this._connected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private doConnect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectIndex = 0;
        log.info(`Connected to Hub: ${this.url}`);
        this.onConnected();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(
            typeof event.data === "string" ? event.data : "",
          ) as HubToEdgeMessage;
          this.onMessage(msg);
        } catch {
          // 忽略无法解析的消息
        }
      };

      this.ws.onclose = () => {
        const wasConnected = this._connected;
        this._connected = false;
        this.ws = null;

        if (wasConnected) {
          log.info("Disconnected from Hub");
          this.onDisconnected();
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onerror 之后必然触发 onclose
      };
    } catch {
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    const backoff = DEFAULTS.RECONNECT_BACKOFF;
    const delay = backoff[Math.min(this.reconnectIndex, backoff.length - 1)];
    this.reconnectIndex++;
    log.info(`Reconnecting to Hub in ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }
}
