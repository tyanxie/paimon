import type {
  InstanceId,
  SessionListItem,
  SessionListQueryParams,
} from "@protocol/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { showToast } from "../../components/ui/Toast";
import { useWebSocket } from "../../stores/useWebSocket";
import { querySessionList } from "./queries";

export function useSessionList(instanceId: InstanceId, sessionId?: string) {
  const { t } = useTranslation();
  const connected = useWebSocket(
    (state) => state.connectionState === "connected",
  );
  const [sessionList, setSessionList] = useState<SessionListItem[]>([]);
  const [sessionListLoading, setSessionListLoading] = useState(false);
  const [sessionHasMore, setSessionHasMore] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const contextRef = useRef({ instanceId, sessionId });
  contextRef.current = { instanceId, sessionId };

  const resetSessionList = useCallback(() => {
    requestRef.current?.abort();
    setSessionList([]);
    setSessionListLoading(false);
    setSessionHasMore(false);
    setSessionTotal(0);
  }, []);

  useEffect(() => {
    resetSessionList();
    return () => requestRef.current?.abort();
  }, [instanceId, sessionId, connected, resetSessionList]);

  const requestSessionList = useCallback(
    (params?: SessionListQueryParams) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const offset = params?.offset ?? 0;
      if (offset === 0) setSessionList([]);
      setSessionListLoading(true);
      void querySessionList(
        instanceId,
        { ...params, offset, sessionId },
        controller.signal,
        t("session.queryError"),
      )
        .then((result) => {
          if (
            controller.signal.aborted ||
            contextRef.current.instanceId !== instanceId ||
            contextRef.current.sessionId !== sessionId ||
            (sessionId !== undefined && result.sessionId !== sessionId)
          )
            return;
          setSessionList((previous) =>
            offset > 0 ? [...previous, ...result.sessions] : result.sessions,
          );
          setSessionHasMore(result.hasMore);
          setSessionTotal(result.total);
          setSessionListLoading(false);
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            contextRef.current.instanceId !== instanceId ||
            contextRef.current.sessionId !== sessionId
          )
            return;
          setSessionListLoading(false);
          showToast(
            error instanceof Error ? error.message : t("session.queryError"),
            "error",
          );
        });
    },
    [instanceId, sessionId, t],
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
