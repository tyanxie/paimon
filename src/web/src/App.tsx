// 根组件

import { useCallback, useEffect, useRef } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
import { useWebSocket } from "./hooks/useWebSocket";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { useAppState } from "./stores/useAppState";
import { Sidebar } from "./components/Sidebar";
import { EventStream } from "./components/EventStream";
import { Settings } from "./components/Settings";
import type { InstanceId, ThinkingLevel } from "../../protocol/types";

/** 从 URL pathname 派生当前选中的实例 ID */
function useSelectedInstanceId(): InstanceId | null {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/instance\/(.+)$/);
  return match ? (match[1] as InstanceId) : null;
}

export default function App() {
  const {
    instances,
    entries,
    streamingEntry,
    hasMore,
    loadState,
    errorMessage,
    draft,
    shouldScrollToBottom,
    sessionChangedInstanceId,
    handleMessage,
    startInstanceRefresh,
    startLoadMore,
    setDraft,
    clearScrollToBottom,
    clearSessionChanged,
  } = useAppState();

  const { connected, send } = useWebSocket(handleMessage);
  const navigate = useNavigate();
  useViewportHeight();
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

    // 订阅新实例，并把右侧对话区切入刷新态
    const exists = instances.some((i) => i.id === selectedInstanceId);
    if (exists) {
      startInstanceRefresh(selectedInstanceId);
      send({
        type: "subscribe",
        payload: { instanceId: selectedInstanceId },
      });
      subscribedRef.current = selectedInstanceId;
      send({ type: "history", payload: { instanceId: selectedInstanceId } });
    }
    // exists 为 false 时不更新 ref，等 instances 加载后重试
  }, [selectedInstanceId, instances, connected, send, startInstanceRefresh]);

  // sessionId 变化时重新拉取 history（/new 、/reload 等场景）
  useEffect(() => {
    if (!sessionChangedInstanceId) return;
    if (connected) {
      send({
        type: "history",
        payload: { instanceId: sessionChangedInstanceId },
      });
    }
    clearSessionChanged();
  }, [sessionChangedInstanceId, connected, send, clearSessionChanged]);

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
      setDraft(selectedInstanceId, "");
    },
    [selectedInstanceId, send, setDraft],
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      if (!selectedInstanceId) return;
      setDraft(selectedInstanceId, value);
    },
    [selectedInstanceId, setDraft],
  );

  const handleAbort = useCallback(() => {
    if (!selectedInstanceId) return;
    send({
      type: "abort",
      payload: { instanceId: selectedInstanceId },
    });
  }, [selectedInstanceId, send]);

  const handleSetModel = useCallback(
    (provider: string, id: string) => {
      if (!selectedInstanceId) return;
      send({
        type: "set_model",
        payload: { instanceId: selectedInstanceId, provider, id },
      });
    },
    [selectedInstanceId, send],
  );

  const handleSetThinkingLevel = useCallback(
    (level: ThinkingLevel) => {
      if (!selectedInstanceId) return;
      send({
        type: "set_thinking_level",
        payload: { instanceId: selectedInstanceId, level },
      });
    },
    [selectedInstanceId, send],
  );

  const selectedInstance = instances.find((i) => i.id === selectedInstanceId);

  // 合并 history + streaming 供渲染
  const instanceEntries = streamingEntry
    ? [...entries, streamingEntry]
    : entries;
  const isStreaming = streamingEntry !== null;

  // 加载更多历史（offset 只计算已完成 entries，不含 streaming）
  const handleLoadMore = useCallback(() => {
    if (!selectedInstanceId || !hasMore || loadState !== "idle") return;
    const offset = entries.length;
    startLoadMore();
    send({
      type: "history",
      payload: {
        instanceId: selectedInstanceId,
        offset,
      },
    });
  }, [
    selectedInstanceId,
    hasMore,
    loadState,
    entries.length,
    startLoadMore,
    send,
  ]);

  return (
    <div className="h-[var(--app-viewport-height,100dvh)] w-screen animated-bg flex items-stretch p-2 gap-2 md:p-3 md:gap-3 overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* 侧边栏：移动端隐藏 */}
      <div className="hidden md:flex self-stretch">
        <Sidebar
          instances={instances}
          selectedId={selectedInstanceId}
          onSelect={handleSelect}
          connected={connected}
        />
      </div>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/instance/:id"
          element={
            <EventStream
              entries={instanceEntries}
              instanceId={selectedInstanceId}
              isStreaming={isStreaming}
              loadState={loadState}
              errorMessage={errorMessage}
              shouldScrollToBottom={shouldScrollToBottom}
              onScrollToBottomHandled={clearScrollToBottom}
              inputValue={draft}
              onInputChange={handleDraftChange}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
              onSetModel={handleSetModel}
              onSetThinkingLevel={handleSetThinkingLevel}
              instanceStatus={selectedInstance?.status}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              contextUsage={selectedInstance?.contextUsage}
              gitBranch={selectedInstance?.gitBranch}
              instanceName={
                selectedInstance?.cwd.split("/").pop() || selectedInstance?.cwd
              }
              instanceModel={selectedInstance?.model}
              availableModels={selectedInstance?.availableModels}
              thinkingLevel={selectedInstance?.thinkingLevel}
            />
          }
        />
        <Route
          path="*"
          element={
            <>
              {/* 移动端：显示实例列表 */}
              <div className="flex-1 md:hidden min-w-0 flex flex-col">
                <Sidebar
                  instances={instances}
                  selectedId={selectedInstanceId}
                  onSelect={handleSelect}
                  connected={connected}
                />
              </div>
              {/* 桌面端：显示空状态 */}
              <div className="hidden md:flex flex-1 min-w-0">
                <EventStream
                  entries={[]}
                  instanceId={null}
                  isStreaming={false}
                  loadState="idle"
                  errorMessage={null}
                  shouldScrollToBottom={false}
                  onScrollToBottomHandled={clearScrollToBottom}
                  inputValue=""
                  onInputChange={() => {}}
                  onSendMessage={handleSendMessage}
                  onAbort={handleAbort}
                />
              </div>
            </>
          }
        />
      </Routes>
    </div>
  );
}
