// WebSocket 连接管理 hook

import { useEffect, useRef, useCallback, useState } from "react";
import type {
  BrowserToHubMessage,
  HubToBrowserMessage,
} from "../../../protocol/types";

type MessageHandler = (msg: HubToBrowserMessage) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/browser`;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // 请求实例列表
        ws.send(JSON.stringify({ type: "list" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as HubToBrowserMessage;
          onMessageRef.current(msg);
        } catch {
          // 忽略
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        // 3s 后重连
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
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
