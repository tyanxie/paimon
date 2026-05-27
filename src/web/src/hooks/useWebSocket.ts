// WebSocket 连接管理 hook

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  BrowserToHubMessage,
  HubToBrowserMessage,
} from "../../../protocol/types";
import { DEFAULTS } from "../../../protocol/types";

type MessageHandler = (msg: HubToBrowserMessage) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/browser`;

    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

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

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        stopHeartbeat();
        // 3s 后重连（组件已卸载则不再重连）
        if (!disposed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
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
  }, []);

  const send = useCallback((msg: BrowserToHubMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, send };
}
