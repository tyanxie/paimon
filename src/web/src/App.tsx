// 根组件

import { useCallback, useEffect, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
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
  const { instances, historyEntries, streamingEntry, hasMore, handleMessage } =
    useAppState();

  const { connected, send } = useWebSocket(handleMessage);
  const navigate = useNavigate();
  const selectedInstanceId = useSelectedInstanceId();

  // 订阅管理：监听 URL 派生的 selectedInstanceId 变化
  const subscribedRef = useRef<InstanceId | null>(null);

  useEffect(() => {
    // WS 未连接时不操作
    if (!connected) return;

    // selectedInstanceId 为 null（去设置页/首页）时保持订阅不动
    if (!selectedInstanceId) return;

    if (selectedInstanceId === subscribedRef.current) return;

    // 切换到了另一个实例，取消订阅旧的
    if (subscribedRef.current) {
      send({
        type: "unsubscribe",
        payload: { instanceId: subscribedRef.current },
      });
      subscribedRef.current = null;
    }

    // 订阅新实例
    const exists = instances.some((i) => i.id === selectedInstanceId);
    if (exists) {
      send({
        type: "subscribe",
        payload: { instanceId: selectedInstanceId },
      });
      subscribedRef.current = selectedInstanceId;
      send({ type: "history", payload: { instanceId: selectedInstanceId } });
    }
    // exists 为 false 时不更新 ref，等 instances 加载后重试
  }, [selectedInstanceId, instances, connected, send]);

  // 点击侧边栏实例：只导航，订阅由 useEffect 自动响应
  const handleSelect = useCallback(
    (id: InstanceId) => {
      navigate(`/instance/${id}`);
    },
    [navigate],
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

  // 合并 history + streaming 供渲染
  const instanceHistory = selectedInstanceId
    ? (historyEntries.get(selectedInstanceId) ?? [])
    : [];
  const instanceStreaming = selectedInstanceId
    ? (streamingEntry.get(selectedInstanceId) ?? null)
    : null;
  const instanceEntries = instanceStreaming
    ? [...instanceHistory, instanceStreaming]
    : instanceHistory;
  const isStreaming = instanceStreaming !== null;
  const instanceHasMore = selectedInstanceId
    ? (hasMore.get(selectedInstanceId) ?? false)
    : false;

  // 加载更多历史（offset 只计算 historyEntries，不含 streaming）
  const handleLoadMore = useCallback(() => {
    if (!selectedInstanceId || !instanceHasMore) return;
    const history = historyEntries.get(selectedInstanceId) ?? [];
    send({
      type: "history",
      payload: {
        instanceId: selectedInstanceId,
        offset: history.length,
      },
    });
  }, [selectedInstanceId, instanceHasMore, historyEntries, send]);

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
            <EventStream
              entries={instanceEntries}
              instanceId={selectedInstanceId}
              isStreaming={isStreaming}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
              instanceStatus={selectedInstance?.status}
              hasMore={instanceHasMore}
              onLoadMore={handleLoadMore}
              contextUsage={selectedInstance?.contextUsage}
              gitBranch={selectedInstance?.gitBranch}
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
