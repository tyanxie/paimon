// WebSocket 连接管理 hook
//
// 支持 token 认证：URL 中附带 ?token=xxx。
// 认证失败（HTTP 401）时通过 onAuthError 回调通知上层。

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  BrowserToHubMessage,
  HubToBrowserMessage,
} from "../../../protocol/types";
import { DEFAULTS } from "../../../protocol/types";

type MessageHandler = (msg: HubToBrowserMessage) => void;

export interface UseWebSocketOptions {
  /** 认证 token（为空时不连接） */
  token: string | null;
  /** 消息回调 */
  onMessage: MessageHandler;
  /** 认证失败回调（WS 升级被 401 拒绝） */
  onAuthError?: () => void;
}

export function useWebSocket({
  token,
  onMessage,
  onAuthError,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  useEffect(() => {
    // 无 token 时不尝试连接
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = `${protocol}//${window.location.host}/ws/browser`;
    const url = `${base}?token=${encodeURIComponent(token)}`;

    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let hasOpened = false;

    function startHeartbeat(ws: WebSocket) {
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
          // 等待 pong 回复，超时则断开触发重连
          pongTimeout = setTimeout(() => {
            ws.close();
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

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        hasOpened = true;
        setConnected(true);
        // 请求实例列表
        ws.send(JSON.stringify({ type: "list" }));
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
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
          onMessageRef.current(msg);
        } catch {
          // 忽略
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        wsRef.current = null;
        stopHeartbeat();

        // HTTP 401 → WS 升级失败，Bun 返回 close code 但不会触发 onopen。
        // 不同浏览器行为略有差异，但通常 code=1006 且从未 open 过。
        // 用认证接口精确判断是否 token 无效（避免 health 无需认证导致误判）。
        if (!disposed && event.code === 1006 && !hasOpened) {
          const headers: HeadersInit = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          fetch("/api/instances", { headers })
            .then((r) => {
              if (r.status === 401) {
                // 明确 401，token 无效
                onAuthErrorRef.current?.();
              } else {
                // 非 401（可能网络抖动/服务瞬断后恢复），正常重连
                scheduleReconnect();
              }
            })
            .catch(() => {
              // 网络不可达，正常重连
              scheduleReconnect();
            });
          return;
        }

        // 正常断连后重连
        if (!disposed) {
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    function scheduleReconnect() {
      if (disposed) return;
      reconnectTimer = setTimeout(connect, 3000);
    }

    connect();

    return () => {
      disposed = true;
      stopHeartbeat();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  const send = useCallback((msg: BrowserToHubMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, send };
}
