// 实例详情页：从 URL 获取 instanceId，管理对话状态和操作
// 实例导航通过父组件提供的入口执行

import { ChevronsDown, Info } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import type {
  ImagePayload,
  InstanceId,
  ThinkingLevel,
} from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import { ImageLightbox } from "../../components/ui/ImageLightbox";
import { MobileNavBar } from "../../components/ui/MobileNavBar";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { EMPTY_DRAFT, useDrafts } from "../../stores/useDrafts";
import { selectInstance, useInstances } from "../../stores/useInstances";
import { useSidebar } from "../../stores/useSidebar";
import { useWebSocket } from "../../stores/useWebSocket";
import { getAdjacentInstanceId } from "../instances/instanceNavigation";
import { isBusy } from "../../utils/status";
import { Composer, type ComposerHandle } from "./Composer";
import { ConversationList } from "./Conversation";
import { InstanceHeader } from "./InstanceHeader";
import { InstanceDetailModal } from "./InstanceDetailModal";
import { SessionPopover } from "./SessionPopover";
import { useConversation } from "./useConversation";
import { useConversationChrome } from "./useConversationChrome";
import { useConversationCopy } from "./useConversationCopy";
import { useReEdit } from "./useReEdit";
import { useScrollAnchor } from "./useScrollAnchor";
import { useSessionList } from "./useSessionList";
import { getComposerButtonMode } from "./utils";

interface InstanceViewProps {
  onSelectInstance: (id: InstanceId) => void;
}

export function InstanceView({ onSelectInstance }: InstanceViewProps) {
  const { t } = useTranslation();
  const { id: instanceId = "" } = useParams<{ id: string }>();

  // ── 全局 stores ──
  const send = useWebSocket((s) => s.send);
  const connected = useWebSocket((s) => s.connectionState === "connected");
  const instance = useInstances(selectInstance(instanceId));
  const draft = useDrafts((s) => s.drafts.get(instanceId) ?? EMPTY_DRAFT);
  const setDraft = useDrafts((s) => s.setDraft);

  const {
    sessionList,
    sessionListLoading,
    sessionHasMore,
    sessionTotal,
    requestSessionList,
    resetSessionList,
  } = useSessionList(instanceId, instance?.sessionId);

  // ── 对话状态（私有 hook） ──
  const {
    entries,
    displayItems,
    pendingUserEntry,
    isAwaitingReply,
    prepareSend,
    isStreaming,
    loadState,
    errorMessage,
    hasMore,
    loadMore,
    retryLoadMore,
  } = useConversation(instanceId, instance, resetSessionList);

  // ── 草稿 ──
  const handleDraftChange = useCallback(
    (value: Parameters<typeof setDraft>[1]) => {
      setDraft(instanceId, value);
    },
    [instanceId, setDraft],
  );

  // ── 操作方法 ──
  const handleAbort = useCallback(() => {
    send({ type: "abort", payload: { instanceId } });
  }, [instanceId, send]);

  const handleSetModel = useCallback(
    (provider: string, modelId: string) => {
      send({
        type: "set_model",
        payload: { instanceId, provider, id: modelId },
      });
    },
    [instanceId, send],
  );

  const handleSetThinkingLevel = useCallback(
    (level: ThinkingLevel) => {
      send({ type: "set_thinking_level", payload: { instanceId, level } });
    },
    [instanceId, send],
  );

  const handleListSessions = useCallback(() => {
    requestSessionList({ offset: 0 });
  }, [requestSessionList]);

  const handleSessionLoadMore = useCallback(
    (offset: number, filter?: string) => {
      requestSessionList({ offset, filter });
    },
    [requestSessionList],
  );

  const handleSessionFilterChange = useCallback(
    (filter: string) => {
      requestSessionList({ offset: 0, filter: filter || undefined });
    },
    [requestSessionList],
  );

  const handleNewSession = useCallback(() => {
    send({ type: "new_session", payload: { instanceId } });
  }, [instanceId, send]);

  const handleSwitchSession = useCallback(
    (path: string) => {
      send({ type: "switch_session", payload: { instanceId, path } });
    },
    [instanceId, send],
  );

  const handleCompact = useCallback(
    (customInstructions?: string) => {
      send({ type: "compact", payload: { instanceId, customInstructions } });
    },
    [instanceId, send],
  );

  // ── 键盘实例导航 ──
  const composerRef = useRef<ComposerHandle>(null);
  const handleNavigateInstance = useCallback(
    (offset: -1 | 1) => {
      // 仅在展示侧栏的桌面布局中支持方向键导航
      if (!window.matchMedia("(min-width: 768px)").matches) return false;
      const { instances, instanceListReady } = useInstances.getState();
      if (
        !instanceListReady ||
        useWebSocket.getState().connectionState !== "connected"
      )
        return false;

      const targetId = getAdjacentInstanceId(
        instances,
        instanceId,
        offset,
        useSidebar.getState().collapsedEdges,
      );
      if (!targetId) return false;

      // 与侧栏共用导航入口，订阅和历史加载仍由 useConversation 管理
      onSelectInstance(targetId);
      return true;
    },
    [instanceId, onSelectInstance],
  );

  useLayoutEffect(() => {
    // 仅桌面布局且主指针非触摸类型时，在进入页面或切换 session 时自动聚焦
    if (
      !window.matchMedia("(min-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    )
      return;
    // 弹窗和菜单正在交互时，不抢走它们的焦点
    if (
      document.querySelector("dialog[open]") ||
      document.activeElement?.closest('[role="dialog"], [role="menu"]')
    )
      return;
    composerRef.current?.focus({ preventScroll: true });
  }, [instanceId, instance?.sessionId]);

  // ── 重新编辑 ──
  const onReEdit = useReEdit(instanceId, entries, instance?.status, () => {
    composerRef.current?.focus();
  });

  // ── 滚动管理 ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useConversationCopy(contentRef);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [detailsInstanceId, setDetailsInstanceId] = useState<string | null>(
    null,
  );
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const isRefreshing = loadState === "refreshing";
  const composerButtonMode = getComposerButtonMode(instance?.status);
  const lastEntryIsCompaction =
    entries.length > 0 && entries[entries.length - 1].type === "compaction";
  const compactDisabled = isBusy(instance?.status) || isAwaitingReply;

  // shouldScrollToBottom 逻辑：首次加载 / session 切换后滚到底部
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const clearScrollToBottom = useCallback(() => {
    setShouldScrollToBottom(false);
  }, []);

  // loadState 从 refreshing → idle 时触发滚到底部
  const prevLoadStateRef = useRef(loadState);
  useLayoutEffect(() => {
    if (prevLoadStateRef.current === "refreshing" && loadState === "idle") {
      setShouldScrollToBottom(true);
    }
    prevLoadStateRef.current = loadState;
  }, [loadState]);

  const {
    topChromeRef,
    bottomChromeRef,
    bottomSafeGapRef,
    topChromeHeight,
    bottomChromeHeight,
    bottomSafeGap,
    scrollSpacing,
  } = useConversationChrome(instanceId);

  // 滚动 hook
  const {
    handleScroll,
    retryLoadMore: handleRetryLoadMore,
    scrollToBottom,
    showScrollBtn,
    startBottomFollow,
    prepareForContentResize,
  } = useScrollAnchor({
    scrollRef,
    contentRef,
    bottomChromeRef,
    entries,
    entriesRef,
    instanceId,
    hasMore,
    shouldScrollToBottom,
    onScrollToBottomHandled: clearScrollToBottom,
    onLoadMore: loadState === "idle" ? loadMore : undefined,
    onRetryLoadMore:
      loadState === "loadingMoreError" ? retryLoadMore : undefined,
    isLoadingMore: loadState === "loadingMore",
    bottomChromeHeight,
    bottomSafeGap,
  });

  const [scrollAfterSend, setScrollAfterSend] = useState(false);
  const handleSendMessage = useCallback(
    (message: string, images?: ImagePayload[]) => {
      if (!prepareSend(message, images)) return;
      send({
        type: "prompt",
        payload: {
          instanceId,
          message,
          images: images?.length ? images : undefined,
        },
      });
      setDraft(instanceId, { text: "", images: [] });
      setScrollAfterSend(true);
    },
    [instanceId, send, setDraft, prepareSend],
  );

  useLayoutEffect(() => {
    if (!scrollAfterSend) return;
    // 占位用户消息和等待区域进入 DOM 后再定位，避免先跳到旧内容底部
    scrollToBottom();
    startBottomFollow();
    setScrollAfterSend(false);
  }, [scrollAfterSend, scrollToBottom, startBottomFollow]);

  const scrollStyle: CSSProperties & {
    "--conversation-top-edge": string;
    "--conversation-bottom-edge": string;
  } = {
    overflowAnchor: "none",
    "--conversation-top-edge": `${topChromeHeight}px`,
    "--conversation-bottom-edge": `${Math.max(0, bottomChromeHeight - bottomSafeGap)}px`,
  };

  // ── 渲染 ──
  const title = instance?.cwd.split("/").pop() || instance?.cwd || "";

  const instanceHeaderProps = {
    title,
    cwd: instance?.cwd,
    homedir: instance?.homedir,
    gitBranch: instance?.gitBranch,
    actions: (
      <>
        <SessionPopover
          sessions={sessionList}
          loading={sessionListLoading}
          hasMore={sessionHasMore}
          total={sessionTotal}
          disabled={isBusy(instance?.status) || isAwaitingReply}
          onOpen={handleListSessions}
          onNewSession={handleNewSession}
          onSwitchSession={handleSwitchSession}
          onLoadMore={handleSessionLoadMore}
          onFilterChange={handleSessionFilterChange}
        />
        <Button
          size="icon"
          disabled={!instance}
          onClick={() => setDetailsInstanceId(instanceId)}
          title={t("instanceDetails.title")}
          aria-label={t("instanceDetails.title")}
          aria-haspopup="dialog"
        >
          <Info size={18} aria-hidden="true" />
        </Button>
      </>
    ),
  };

  return (
    <div className="relative flex-1 min-w-0 overflow-hidden">
      <main className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
        {/* 顶部悬浮信息栏 */}
        <div
          ref={topChromeRef}
          className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-3 pt-3 md:px-4 md:pt-0"
        >
          <div
            className="conversation-topbar header-material pointer-events-auto w-full px-3 py-2 md:px-4"
            role="region"
            aria-label={t("conversation.instanceInfo")}
          >
            {/* PC 端 */}
            <div className="hidden md:flex">
              <InstanceHeader {...instanceHeaderProps} />
            </div>
            {/* 移动端 */}
            <MobileNavBar>
              <InstanceHeader {...instanceHeaderProps} />
            </MobileNavBar>
          </div>
        </div>

        {/* 消息列表区域 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={scrollStyle}
          aria-busy={isRefreshing}
          className="conversation-scroll absolute bottom-[var(--bottom-safe-gap)] left-0 right-0 top-0 overflow-y-auto scrollbar-auto px-3 md:bottom-0 md:px-4"
        >
          <div
            ref={contentRef}
            style={{
              paddingTop: scrollSpacing.paddingTop,
              paddingBottom: scrollSpacing.paddingBottom,
            }}
            className="mx-auto max-w-[920px] space-y-2"
          >
            {loadState === "loadingMore" && (
              <StatusMessage compact tone="loading" className="justify-center">
                {t("conversation.loadingEarlier")}
              </StatusMessage>
            )}
            {loadState === "loadingMoreError" && (
              <div className="conversation-history-error">
                <div className="conversation-history-error-row">
                  <StatusMessage compact tone="error">
                    {t("conversation.loadingEarlierFailed")}
                  </StatusMessage>
                  <Button
                    size="inline"
                    variant="ghost"
                    className="conversation-history-retry"
                    onClick={handleRetryLoadMore}
                  >
                    {t("conversation.retryLoadingEarlier")}
                  </Button>
                </div>
                {errorMessage && (
                  <div className="conversation-history-error-detail">
                    {errorMessage}
                  </div>
                )}
              </div>
            )}
            {isRefreshing ? (
              <RefreshingConversationSkeleton />
            ) : loadState === "error" ? (
              <StatusMessage
                tone="error"
                detail={errorMessage}
                className="mx-auto mt-8 max-w-[520px] border border-[var(--separator)] bg-[var(--fill-card)]"
              >
                {t("conversation.loadFailed")}
              </StatusMessage>
            ) : displayItems.length === 0 &&
              !hasMore &&
              !isBusy(instance?.status) &&
              !isStreaming &&
              !isAwaitingReply ? (
              <StatusMessage className="pt-8">
                {t("conversation.noMessages")}
              </StatusMessage>
            ) : (
              <ConversationList
                items={displayItems}
                conversationKey={`${instanceId}:${instance?.sessionId ?? ""}`}
                status={instance?.status}
                isStreaming={isStreaming}
                pendingUserEntry={pendingUserEntry}
                isAwaitingReply={isAwaitingReply}
                onReEdit={isAwaitingReply ? undefined : onReEdit}
                onBeforeToggle={prepareForContentResize}
              />
            )}
          </div>
        </div>

        {/* 快速滚动到底部按钮 */}
        {showScrollBtn && (
          <div
            style={{ bottom: scrollSpacing.scrollButtonBottom }}
            className="absolute left-1/2 z-30 -translate-x-1/2"
          >
            <Button
              size="icon"
              onClick={scrollToBottom}
              aria-label={t("eventStream.scrollToBottom")}
              className="conversation-scroll-bottom"
              title={t("eventStream.scrollToBottom")}
            >
              <ChevronsDown size={16} aria-hidden="true" />
            </Button>
          </div>
        )}

        {/* 底部悬浮输入区 */}
        <div
          ref={bottomChromeRef}
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-3 pb-0 md:px-4"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[920px]">
            <Composer
              key={`${instanceId}:${instance?.sessionId ?? ""}`}
              ref={composerRef}
              instance={instance}
              tasks={instance?.tasks}
              draft={draft}
              onDraftChange={handleDraftChange}
              onNavigateInstance={handleNavigateInstance}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
              onSetModel={handleSetModel}
              onSetThinkingLevel={handleSetThinkingLevel}
              onCompact={handleCompact}
              buttonMode={composerButtonMode}
              showCompactButton={!lastEntryIsCompaction}
              compactDisabled={compactDisabled}
              sendDisabled={
                !connected ||
                isAwaitingReply ||
                isRefreshing ||
                loadState === "error"
              }
              onImageLightbox={setLightboxSrc}
            />
            <div
              ref={bottomSafeGapRef}
              className="h-[var(--bottom-safe-gap)] md:h-0"
              aria-hidden="true"
            />
          </div>
        </div>
      </main>

      {/* 详情弹窗与图片查看 */}
      <AnimatePresence>
        {detailsInstanceId === instanceId && instance && (
          <InstanceDetailModal
            key={`details:${instanceId}`}
            instance={instance}
            onClose={() => setDetailsInstanceId(null)}
          />
        )}
        {lightboxSrc && (
          <ImageLightbox
            key="image"
            src={lightboxSrc}
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── 内部子组件 ──────────────────────────────────────────────────

function RefreshingConversationSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      className="space-y-3 pt-3 select-none"
      aria-label={t("conversation.loadingConversation")}
    >
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="space-y-4 rounded-surface border border-[var(--separator)] bg-[var(--fill-quaternary)] px-4 py-4 animate-pulse"
        >
          <div className="h-4 w-28 rounded-inline bg-[var(--fill-tertiary)]" />
          <div className="space-y-2.5">
            <div className="h-3 w-[82%] rounded-inline bg-[var(--fill-secondary)]" />
            <div className="h-3 w-[64%] rounded-inline bg-[var(--fill-tertiary)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
