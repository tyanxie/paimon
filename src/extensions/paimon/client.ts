// WebSocket 客户端：连接 Hub + 指数退避重连

import type {
  ExtensionToHubMessage,
  HubToExtensionMessage,
} from "../../protocol/types";
import { DEFAULTS } from "../../protocol/types";

export type MessageHandler = (msg: HubToExtensionMessage) => void;
export type ConnectionHandler = () => void;

export class HubClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectIndex = 0;
  private reconnectTimer: Timer | null = null;
  private onMessage: MessageHandler;
  private onConnected: ConnectionHandler;
  private onDisconnected: ConnectionHandler;
  private shouldReconnect = true;
  private _connected = false;

  constructor(options: {
    port: number;
    onMessage: MessageHandler;
    onConnected: ConnectionHandler;
    onDisconnected: ConnectionHandler;
  }) {
    this.url = `ws://localhost:${options.port}/ws/extension`;
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
      this.ws.close(1000, "Extension shutting down");
      this.ws = null;
    }
    this._connected = false;
  }

  /** 发送消息 */
  send(msg: ExtensionToHubMessage): void {
    if (this.ws && this._connected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private doConnect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectIndex = 0; // 重置退避
        this.onConnected();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(
            typeof event.data === "string" ? event.data : "",
          ) as HubToExtensionMessage;
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
          this.onDisconnected();
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onerror 之后必然触发 onclose，不需要额外处理
      };
    } catch {
      // 连接失败，调度重连
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    const backoff = DEFAULTS.RECONNECT_BACKOFF;
    const delay = backoff[Math.min(this.reconnectIndex, backoff.length - 1)];
    this.reconnectIndex++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }
}
