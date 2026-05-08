// 根组件

import { useCallback } from "react";
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
    events,
    handleMessage,
  } = useAppState();

  const { connected, send } = useWebSocket(handleMessage);

  // 选中实例时自动订阅
  const handleSelect = useCallback(
    (id: InstanceId) => {
      // 取消之前的订阅
      if (selectedInstanceId) {
        send({
          type: "unsubscribe",
          payload: { instanceId: selectedInstanceId },
        });
      }
      // 订阅新实例
      send({ type: "subscribe", payload: { instanceId: id } });
      setSelectedInstanceId(id);
    },
    [selectedInstanceId, send, setSelectedInstanceId],
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
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        instances={instances}
        selectedId={selectedInstanceId}
        onSelect={handleSelect}
        connected={connected}
      />
      <EventStream
        events={events}
        instanceId={selectedInstanceId}
        onSendMessage={handleSendMessage}
        onAbort={handleAbort}
        instanceStatus={selectedInstance?.status}
      />
    </div>
  );
}
