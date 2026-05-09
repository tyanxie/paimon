// 根组件

import { useCallback, useEffect, useMemo } from "react";
import {
  Routes,
  Route,
  useParams,
  useNavigate,
  useLocation,
} from "react-router";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAppState } from "./stores/useAppState";
import { Sidebar } from "./components/Sidebar";
import { EventStream } from "./components/EventStream";
import { Settings } from "./components/Settings";
import type { InstanceId } from "../../protocol/types";

/** 从 URL pathname 派生当前选中的实例 ID */
function useSelectedInstanceId(): InstanceId | null {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/instance\/(.+)$/);
  return match ? (match[1] as InstanceId) : null;
}

export default function App() {
  const { instances, entries, streamingInstances, handleMessage } =
    useAppState();

  const { connected, send } = useWebSocket(handleMessage);
  const navigate = useNavigate();
  const selectedInstanceId = useSelectedInstanceId();

  // 选中实例时导航 + 订阅 + 请求历史
  const handleSelect = useCallback(
    (id: InstanceId) => {
      if (selectedInstanceId) {
        send({
          type: "unsubscribe",
          payload: { instanceId: selectedInstanceId },
        });
      }
      send({ type: "subscribe", payload: { instanceId: id } });
      send({ type: "history", payload: { instanceId: id } });
      navigate(`/instance/${id}`);
    },
    [selectedInstanceId, send, navigate],
  );

  const handleSendMessage = useCallback(
    (message: string) => {
      if (!selectedInstanceId) return;
      send({
        type: "prompt",
        payload: { instanceId: selectedInstanceId, message },
      });
    },
    [selectedInstanceId, send],
  );

  const handleAbort = useCallback(() => {
    if (!selectedInstanceId) return;
    send({
      type: "abort",
      payload: { instanceId: selectedInstanceId },
    });
  }, [selectedInstanceId, send]);

  const selectedInstance = instances.find((i) => i.id === selectedInstanceId);

  return (
    <div className="h-screen w-screen animated-bg flex items-stretch p-3 gap-3 overflow-hidden">
      <Sidebar
        instances={instances}
        selectedId={selectedInstanceId}
        onSelect={handleSelect}
        connected={connected}
      />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/instance/:id"
          element={
            <InstanceRoute
              instances={instances}
              selectedInstanceId={selectedInstanceId}
              send={send}
              entries={entries}
              streamingInstances={streamingInstances}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
              instanceStatus={selectedInstance?.status}
            />
          }
        />
        <Route
          path="*"
          element={
            <EventStream
              entries={[]}
              instanceId={null}
              isStreaming={false}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
            />
          }
        />
      </Routes>
    </div>
  );
}

/** 处理 URL 中的实例 ID：同步路由参数到订阅 */
function InstanceRoute({
  instances,
  selectedInstanceId,
  send,
  entries,
  streamingInstances,
  onSendMessage,
  onAbort,
  instanceStatus,
}: {
  instances: Array<{ id: InstanceId }>;
  selectedInstanceId: InstanceId | null;
  send: (msg: any) => void;
  entries: Map<InstanceId, unknown[]>;
  streamingInstances: Set<InstanceId>;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  instanceStatus?: "idle" | "streaming";
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // URL 中的 id 变化时，订阅实例
  useEffect(() => {
    if (!id) return;

    const exists = instances.some((i) => i.id === id);
    if (exists && id !== selectedInstanceId) {
      if (selectedInstanceId) {
        send({
          type: "unsubscribe",
          payload: { instanceId: selectedInstanceId },
        });
      }
      send({ type: "subscribe", payload: { instanceId: id } });
      send({ type: "history", payload: { instanceId: id } });
    } else if (!exists && instances.length > 0) {
      navigate("/", { replace: true });
    }
  }, [id, instances, selectedInstanceId, send, navigate]);

  const instanceEntries = (entries.get(id as InstanceId) ?? []) as any[];
  const isStreaming = streamingInstances.has(id as InstanceId);

  return (
    <EventStream
      entries={instanceEntries}
      instanceId={id as InstanceId | null}
      isStreaming={isStreaming}
      onSendMessage={onSendMessage}
      onAbort={onAbort}
      instanceStatus={instanceStatus}
    />
  );
}
