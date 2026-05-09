// 根组件

import { useCallback, useEffect } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAppState } from "./stores/useAppState";
import { Sidebar } from "./components/Sidebar";
import { EventStream } from "./components/EventStream";
import type { InstanceId } from "../../protocol/types";

export default function App() {
  const {
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    entries,
    streamingInstances,
    handleMessage,
  } = useAppState();

  const { connected, send } = useWebSocket(handleMessage);
  const navigate = useNavigate();

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
      setSelectedInstanceId(id);
      navigate(`/instance/${id}`);
    },
    [selectedInstanceId, send, setSelectedInstanceId, navigate],
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
        <Route
          path="/instance/:id"
          element={
            <InstanceRoute
              instances={instances}
              selectedInstanceId={selectedInstanceId}
              setSelectedInstanceId={setSelectedInstanceId}
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

/** 处理 URL 中的实例 ID：同步路由参数到状态 */
function InstanceRoute({
  instances,
  selectedInstanceId,
  setSelectedInstanceId,
  send,
  entries,
  streamingInstances,
  onSendMessage,
  onAbort,
  instanceStatus,
}: {
  instances: Array<{ id: InstanceId }>;
  selectedInstanceId: InstanceId | null;
  setSelectedInstanceId: (id: InstanceId | null) => void;
  send: (msg: any) => void;
  entries: Map<InstanceId, unknown[]>;
  streamingInstances: Set<InstanceId>;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  instanceStatus?: "idle" | "streaming";
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // URL 中的 id 变化时，同步选中状态 + 订阅
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
      setSelectedInstanceId(id);
    } else if (!exists && instances.length > 0) {
      navigate("/", { replace: true });
      setSelectedInstanceId(null);
    }
  }, [
    id,
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    send,
    navigate,
  ]);

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
