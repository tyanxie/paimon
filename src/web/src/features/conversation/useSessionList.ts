import type { InstanceId, SessionListItem } from "@protocol/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../stores/useWebSocket";

export function useSessionList(instanceId: InstanceId) {
  const send = useWebSocket((state) => state.send);
  const subscribe = useWebSocket((state) => state.subscribe);
  const [sessionList, setSessionList] = useState<SessionListItem[]>([]);
  const [sessionListLoading, setSessionListLoading] = useState(false);
  const [sessionHasMore, setSessionHasMore] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const sessionOffsetRef = useRef(0);

  const resetSessionList = useCallback(() => {
    setSessionList([]);
    setSessionListLoading(false);
    setSessionHasMore(false);
    setSessionTotal(0);
  }, []);

  useEffect(
    () =>
      subscribe((message) => {
        if (
          message.type !== "session_list" ||
          message.payload.instanceId !== instanceId
        )
          return;
        const { sessions, hasMore, total } = message.payload;
        setSessionList((previous) =>
          sessionOffsetRef.current > 0 ? [...previous, ...sessions] : sessions,
        );
        setSessionHasMore(hasMore ?? false);
        setSessionTotal(total ?? sessions.length);
        setSessionListLoading(false);
      }),
    [instanceId, subscribe],
  );

  const requestSessionList = useCallback(
    (params?: { offset?: number; limit?: number; filter?: string }) => {
      const offset = params?.offset ?? 0;
      sessionOffsetRef.current = offset;
      if (offset === 0) setSessionList([]);
      setSessionListLoading(true);
      send({
        type: "list_sessions",
        payload: {
          instanceId,
          offset,
          limit: params?.limit,
          filter: params?.filter,
        },
      });
    },
    [instanceId, send],
  );

  return {
    sessionList,
    sessionListLoading,
    sessionHasMore,
    sessionTotal,
    requestSessionList,
    resetSessionList,
  };
}
