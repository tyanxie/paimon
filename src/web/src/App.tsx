// 根组件：auth + 路由 + 全局 WS 订阅

import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./stores/useWebSocket";
import { useInstances } from "./stores/useInstances";
import { Sidebar } from "./components/Sidebar";
import { InstanceView } from "./components/InstanceView";
import { Home } from "./components/Home";
import { MainPanel } from "./components/MainPanel";
import { Settings } from "./components/Settings";
import { NewInstanceModal } from "./components/ui/NewInstanceModal";
import { LoginPage } from "./components/LoginPage";
import { ToastContainer, showToast } from "./components/ui/Toast";
import type { InstanceId } from "../../protocol/types";
import { isBusy } from "./utils/status";
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

  // ── WebSocket 连接管理 ──
  const connect = useWebSocket((s) => s.connect);
  const disconnect = useWebSocket((s) => s.disconnect);
  const subscribe = useWebSocket((s) => s.subscribe);
  const send = useWebSocket((s) => s.send);

  // ── Instances store ──
  const instances = useInstances((s) => s.instances);
  const instanceListReady = useInstances((s) => s.instanceListReady);
  const handleInstanceMessage = useInstances((s) => s.handleMessage);

  const navigate = useNavigate();
  useViewportHeight();
  const selectedInstanceId = useSelectedInstanceId();

  // ── 建立/断开 WS 连接 ──
  useEffect(() => {
    if (authToken) {
      connect(authToken, handleAuthError);
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [authToken, connect, disconnect, handleAuthError]);

  // ── 常驻 WS 订阅：instance_list / instance_update → useInstances ──
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "instance_list" || msg.type === "instance_update") {
        handleInstanceMessage(msg);
      }
    });
  }, [subscribe, handleInstanceMessage]);

  // ── 导航 ──
  const handleSelect = useCallback(
    (id: InstanceId) => {
      navigate(`/instance/${id}`);
    },
    [navigate],
  );

  // ── Shutdown ──
  // 追踪主动 shutdown 的实例，区分主动退出与意外断连
  const shuttingDownRef = useRef<Set<InstanceId>>(new Set());

  const handleShutdown = useCallback(
    (id: InstanceId) => {
      // busy 时拒绝退出
      const instance = useInstances
        .getState()
        .instances.find((i) => i.id === id);
      if (instance && isBusy(instance.status)) {
        showToast(t("sidebar.shutdownBusy"));
        return;
      }
      shuttingDownRef.current.add(id);
      send({ type: "shutdown", payload: { instanceId: id } });
    },
    [send, t],
  );

  // 新建实例弹窗
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
      // 主动 shutdown 引起的消失不弹 toast
      if (shuttingDownRef.current.has(selectedInstanceId)) {
        shuttingDownRef.current.delete(selectedInstanceId);
      } else {
        showToast(t("eventStream.instanceNotFound"));
      }
      navigate("/");
    }
  }, [instanceListReady, selectedInstanceId, instances, navigate, t]);

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
        />
      </div>

      <Routes>
        <Route element={<MainPanel />}>
          <Route path="/settings" element={<Settings />} />
          <Route path="/instance/:id" element={<InstanceView />} />
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
                  />
                </div>
                {/* 桌面端：显示首页 */}
                <div className="hidden md:flex flex-1 min-w-0">
                  <Home />
                </div>
              </>
            }
          />
        </Route>
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
