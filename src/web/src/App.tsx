// 根组件

import { useCallback, useEffect, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
import { useWebSocket } from "./hooks/useWebSocket";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { useAuth } from "./hooks/useAuth";
import { useInstanceActions } from "./hooks/useInstanceActions";
import { useSubscription } from "./hooks/useSubscription";
import { useApp } from "./stores/useApp";
import { Sidebar } from "./components/Sidebar";
import { InstanceView } from "./components/InstanceView";
import { Settings } from "./components/Settings";
import { NewInstanceModal } from "./components/ui/NewInstanceModal";
import { LoginPage } from "./components/LoginPage";
import { ToastContainer, showToast } from "./components/ui/Toast";
import type { InstanceId } from "../../protocol/types";
import { EMPTY_DRAFT, type InputDraftUpdater } from "./stores/types";
import { useTranslation } from "react-i18next";

/** 从 URL pathname 派生当前选中的实例 ID */
function useSelectedInstanceId(): InstanceId | null {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/instance\/(.+)$/);
  return match ? (match[1] as InstanceId) : null;
}

export default function App() {
  const { t } = useTranslation();

  // ── 认证 ──
  const { authToken, authError, handleLogin, handleAuthError } = useAuth();

  // ── 全局状态 ──
  const {
    instances,
    instanceListReady,
    entries,
    streamingEntry,
    hasMore,
    loadState,
    errorMessage,
    draft,
    shouldScrollToBottom,
    sessionChangedInstanceId,
    sessionList,
    sessionListLoading,
    handleMessage,
    startInstanceRefresh,
    startLoadMore,
    setDraft,
    setSessionListLoading,
    clearScrollToBottom,
    clearSessionChanged,
  } = useApp();

  // ── WebSocket ──
  const { connected, send } = useWebSocket({
    token: authToken,
    onMessage: handleMessage,
    onAuthError: handleAuthError,
  });

  const navigate = useNavigate();
  useViewportHeight();
  const selectedInstanceId = useSelectedInstanceId();

  // ── 订阅管理 ──
  useSubscription(
    selectedInstanceId,
    instances,
    connected,
    send,
    startInstanceRefresh,
    sessionChangedInstanceId,
    clearSessionChanged,
  );

  // ── 实例操作 ──
  const {
    handleSendMessage,
    handleAbort,
    handleSetModel,
    handleSetThinkingLevel,
    handleListSessions,
    handleNewSession,
    handleSwitchSession,
    handleCompact,
    handleShutdown,
  } = useInstanceActions(
    selectedInstanceId,
    send,
    setDraft,
    setSessionListLoading,
  );

  // ── 导航 ──
  const handleSelect = useCallback(
    (id: InstanceId) => {
      navigate(`/instance/${id}`);
    },
    [navigate],
  );

  const handleDraftChange = useCallback(
    (value: InputDraftUpdater) => {
      if (!selectedInstanceId) return;
      setDraft(selectedInstanceId, value);
    },
    [selectedInstanceId, setDraft],
  );

  // 新建实例弹窗开关
  const [showNewInstance, setShowNewInstance] = useState(false);

  const handleInstanceCreated = useCallback(
    (id: InstanceId) => {
      setShowNewInstance(false);
      navigate(`/instance/${id}`);
    },
    [navigate],
  );

  // 实例不存在时跳转到首页并提示
  useEffect(() => {
    if (!instanceListReady || !selectedInstanceId) return;
    const exists = instances.some((i) => i.id === selectedInstanceId);
    if (!exists) {
      showToast(t("eventStream.instanceNotFound"));
      navigate("/");
    }
  }, [instanceListReady, selectedInstanceId, instances, navigate]);

  // ── 派生数据 ──
  const selectedInstance = instances.find((i) => i.id === selectedInstanceId);
  const instanceEntries = streamingEntry
    ? [...entries, streamingEntry]
    : entries;
  const isStreaming = streamingEntry !== null;

  // 加载更多历史
  const handleLoadMore = useCallback(() => {
    if (!selectedInstanceId || !hasMore || loadState !== "idle") return;
    const offset = entries.length;
    startLoadMore();
    send({
      type: "get_history",
      payload: { instanceId: selectedInstanceId, offset },
    });
  }, [
    selectedInstanceId,
    hasMore,
    loadState,
    entries.length,
    startLoadMore,
    send,
  ]);

  // ── 未认证 ──
  if (!authToken) {
    return (
      <div className="h-[var(--app-viewport-height,100dvh)] w-screen animated-bg flex items-stretch overflow-hidden">
        <LoginPage onLogin={handleLogin} error={authError} />
      </div>
    );
  }

  // ── 主界面 ──
  return (
    <div className="h-[var(--app-viewport-height,100dvh)] w-screen animated-bg flex items-stretch p-2 gap-2 md:p-3 md:gap-3 overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* 侧边栏：移动端隐藏 */}
      <div className="hidden md:flex self-stretch">
        <Sidebar
          instances={instances}
          selectedId={selectedInstanceId}
          onSelect={handleSelect}
          onShutdown={handleShutdown}
          onNewInstance={() => setShowNewInstance(true)}
          connected={connected}
        />
      </div>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route
          path="/instance/:id"
          element={
            <InstanceView
              entries={instanceEntries}
              instanceId={selectedInstanceId}
              isStreaming={isStreaming}
              loadState={loadState}
              errorMessage={errorMessage}
              shouldScrollToBottom={shouldScrollToBottom}
              onScrollToBottomHandled={clearScrollToBottom}
              draft={draft}
              onDraftChange={handleDraftChange}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
              onSetModel={handleSetModel}
              onSetThinkingLevel={handleSetThinkingLevel}
              instanceStatus={selectedInstance?.status}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              contextUsage={selectedInstance?.contextUsage}
              gitBranch={selectedInstance?.gitBranch}
              instanceCwd={selectedInstance?.cwd}
              instanceHomedir={selectedInstance?.homedir}
              instanceName={
                selectedInstance?.cwd.split("/").pop() || selectedInstance?.cwd
              }
              instanceModel={selectedInstance?.model}
              availableModels={selectedInstance?.availableModels}
              thinkingLevel={selectedInstance?.thinkingLevel}
              sessionList={sessionList}
              sessionListLoading={sessionListLoading}
              onListSessions={handleListSessions}
              onNewSession={handleNewSession}
              onSwitchSession={handleSwitchSession}
              onCompact={handleCompact}
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
                  onShutdown={handleShutdown}
                  onNewInstance={() => setShowNewInstance(true)}
                  connected={connected}
                />
              </div>
              {/* 桌面端：显示空状态 */}
              <div className="hidden md:flex flex-1 min-w-0">
                <InstanceView
                  entries={[]}
                  instanceId={null}
                  isStreaming={false}
                  loadState="idle"
                  errorMessage={null}
                  shouldScrollToBottom={false}
                  onScrollToBottomHandled={clearScrollToBottom}
                  draft={EMPTY_DRAFT}
                  onDraftChange={() => {}}
                  onSendMessage={handleSendMessage}
                  onAbort={handleAbort}
                />
              </div>
            </>
          }
        />
      </Routes>

      {/* 新建实例弹窗 */}
      {showNewInstance && (
        <NewInstanceModal
          onClose={() => setShowNewInstance(false)}
          onCreated={handleInstanceCreated}
        />
      )}

      {/* 全局 Toast */}
      <ToastContainer />
    </div>
  );
}
