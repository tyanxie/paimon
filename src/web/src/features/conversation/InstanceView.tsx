// 实例详情页：自治页面组件
// 从 URL 获取 instanceId，内部管理所有状态和操作

import { ChevronsDown } from "lucide-react";
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
import type { ImagePayload, ThinkingLevel } from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import { ImageLightbox } from "../../components/ui/ImageLightbox";
import { MobileNavBar } from "../../components/ui/MobileNavBar";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { EMPTY_DRAFT, useDrafts } from "../../stores/useDrafts";
import { selectInstance, useInstances } from "../../stores/useInstances";
import { useWebSocket } from "../../stores/useWebSocket";
import { isBusy } from "../../utils/status";
import { Composer, type ComposerHandle } from "./Composer";
import { ConversationList } from "./Conversation";
import { InstanceHeader } from "./InstanceHeader";
import { SessionPopover } from "./SessionPopover";
import { useConversation } from "./useConversation";
import { useConversationChrome } from "./useConversationChrome";
import { useReEdit } from "./useReEdit";
import { useScrollAnchor } from "./useScrollAnchor";
import { useSessionList } from "./useSessionList";
import { getComposerButtonMode } from "./utils";

export function InstanceView() {
  const { t } = useTranslation();
  const { id: instanceId = "" } = useParams<{ id: string }>();

  // ── 全局 stores ──
  const send = useWebSocket((s) => s.send);
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
  } = useSessionList(instanceId);

  // ── 对话状态（私有 hook） ──
  const {
    entries,
    displayItems,
    isStreaming,
    loadState,
    errorMessage,
    hasMore,
    loadMore,
  } = useConversation(instanceId, instance, resetSessionList);

  // ── 草稿 ──
  const handleDraftChange = useCallback(
    (value: Parameters<typeof setDraft>[1]) => {
      setDraft(instanceId, value);
    },
    [instanceId, setDraft],
  );

  // ── 操作方法 ──
  const handleSendMessage = useCallback(
    (message: string, images?: ImagePayload[]) => {
      send({
        type: "prompt",
        payload: {
          instanceId,
          message,
          images: images?.length ? images : undefined,
        },
      });
      setDraft(instanceId, { text: "", images: [] });
    },
    [instanceId, send, setDraft],
  );

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

  // ── 重新编辑 ──
  const composerRef = useRef<ComposerHandle>(null);
  const onReEdit = useReEdit(instanceId, entries, instance?.status, () => {
    composerRef.current?.focus();
  });

  // ── 滚动管理 ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const isRefreshing = loadState === "refreshing";
  const composerButtonMode = getComposerButtonMode(instance?.status);
  const lastEntryIsCompaction =
    entries.length > 0 && entries[entries.length - 1].type === "compaction";
  const compactDisabled = isBusy(instance?.status);

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
    onLoadMore: loadMore,
    bottomChromeHeight,
    bottomSafeGap,
  });

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
      <SessionPopover
        sessions={sessionList}
        loading={sessionListLoading}
        hasMore={sessionHasMore}
        total={sessionTotal}
        disabled={isBusy(instance?.status)}
        onOpen={handleListSessions}
        onNewSession={handleNewSession}
        onSwitchSession={handleSwitchSession}
        onLoadMore={handleSessionLoadMore}
        onFilterChange={handleSessionFilterChange}
      />
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
              !isStreaming ? (
              <StatusMessage className="pt-8">
                {t("conversation.noMessages")}
              </StatusMessage>
            ) : (
              <ConversationList
                items={displayItems}
                conversationKey={`${instanceId}:${instance?.sessionId ?? ""}`}
                status={instance?.status}
                isStreaming={isStreaming}
                onReEdit={onReEdit}
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
              draft={draft}
              onDraftChange={handleDraftChange}
              onSendMessage={handleSendMessage}
              onAbort={handleAbort}
              onSetModel={handleSetModel}
              onSetThinkingLevel={handleSetThinkingLevel}
              onCompact={handleCompact}
              buttonMode={composerButtonMode}
              showCompactButton={!lastEntryIsCompaction}
              compactDisabled={compactDisabled}
              onImageLightbox={setLightboxSrc}
              startBottomFollow={startBottomFollow}
            />
            <div
              ref={bottomSafeGapRef}
              className="h-[var(--bottom-safe-gap)] md:h-0"
              aria-hidden="true"
            />
          </div>
        </div>
      </main>

      {/* 图片大图查看 */}
      <AnimatePresence>
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
