// WebSocket 全局 store：管理连接、提供 send、支持消息订阅

import { create } from "zustand";
import type {
  BrowserToHubMessage,
  HubToBrowserMessage,
} from "../../../protocol/types";
import { DEFAULTS } from "../../../protocol/types";

// ── 类型 ──

export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected";

type MessageHandler = (msg: HubToBrowserMessage) => void;
type Unsubscribe = () => void;

interface WebSocketState {
  /** 连接状态（idle → connecting → connected / disconnected） */
  connectionState: ConnectionState;
  /** 发送消息到 Hub */
  send: (msg: BrowserToHubMessage) => void;
  /** 订阅服务端推送消息，返回取消订阅函数 */
  subscribe: (handler: MessageHandler) => Unsubscribe;
  /** 建立连接（需 token） */
  connect: (token: string, onAuthError?: () => void) => void;
  /** 断开连接 */
  disconnect: () => void;
}

// ── 模块级变量（不放 Zustand state 中，避免序列化/代理问题）──

let ws: WebSocket | null = null;
const listeners = new Set<MessageHandler>();
let disposed = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectingTimeout: ReturnType<typeof setTimeout> | null = null;
let currentToken: string | null = null;
let currentOnAuthError: (() => void) | undefined;
let hasOpened = false;

/** connecting 超时时间（ms） */
const CONNECTING_TIMEOUT = 3000;
/** 断连后重连延迟（ms） */
const RECONNECT_DELAY = 3000;

// ── 内部函数 ──

function broadcast(msg: HubToBrowserMessage) {
  for (const handler of listeners) {
    try {
      handler(msg);
    } catch (e) {
      console.error("[useWebSocket] listener error:", e);
    }
  }
}

function startHeartbeat(socket: WebSocket) {
  pingTimer = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
      pongTimeout = setTimeout(() => {
        socket.close();
      }, DEFAULTS.HEARTBEAT_TIMEOUT);
    }
  }, DEFAULTS.HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (pongTimeout) {
    clearTimeout(pongTimeout);
    pongTimeout = null;
  }
}

function scheduleReconnect() {
  if (disposed) return;
  reconnectTimer = setTimeout(doConnect, RECONNECT_DELAY);
}

function clearConnectingTimeout() {
  if (connectingTimeout) {
    clearTimeout(connectingTimeout);
    connectingTimeout = null;
  }
}

function doConnect() {
  if (disposed || !currentToken) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${protocol}//${window.location.host}/ws/browser`;
  const url = `${base}?token=${encodeURIComponent(currentToken)}`;

  hasOpened = false;
  const socket = new WebSocket(url);
  ws = socket;

  useWebSocket.setState({ connectionState: "connecting" });

  // connecting 超时：强制关闭，触发 onclose → disconnected
  connectingTimeout = setTimeout(() => {
    connectingTimeout = null;
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }, CONNECTING_TIMEOUT);

  socket.onopen = () => {
    clearConnectingTimeout();
    hasOpened = true;
    useWebSocket.setState({ connectionState: "connected" });
    // 请求实例列表
    socket.send(JSON.stringify({ type: "list" }));
    startHeartbeat(socket);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as HubToBrowserMessage;
      // 心跳回复：清除超时定时器，不透传给业务层
      if (msg.type === "pong") {
        if (pongTimeout) {
          clearTimeout(pongTimeout);
          pongTimeout = null;
        }
        return;
      }
      broadcast(msg);
    } catch {
      // 忽略非 JSON 消息
    }
  };

  socket.onclose = (event) => {
    clearConnectingTimeout();
    useWebSocket.setState({ connectionState: "disconnected" });
    ws = null;
    stopHeartbeat();

    // HTTP 401 → WS 升级失败检测
    if (!disposed && !hasOpened) {
      const headers: HeadersInit = {};
      if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
      fetch("/api/instances", { headers })
        .then((r) => {
          if (r.status === 401) {
            currentOnAuthError?.();
          } else {
            scheduleReconnect();
          }
        })
        .catch(() => {
          scheduleReconnect();
        });
      return;
    }

    if (!disposed) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    socket.close();
  };
}

// ── Store ──

export const useWebSocket = create<WebSocketState>((set, get) => ({
  connectionState: "idle",

  send: (msg) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  },

  subscribe: (handler) => {
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  },

  connect: (token, onAuthError) => {
    // 先清理旧连接
    get().disconnect();

    disposed = false;
    currentToken = token;
    currentOnAuthError = onAuthError;
    doConnect();
  },

  disconnect: () => {
    disposed = true;
    currentToken = null;
    currentOnAuthError = undefined;
    stopHeartbeat();
    clearConnectingTimeout();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    set({ connectionState: "idle" });
  },
}));
