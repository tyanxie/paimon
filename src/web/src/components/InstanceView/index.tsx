// 实例详情页：自治页面组件
// 从 URL 获取 instanceId，内部管理所有状态和操作

import { useRef, useLayoutEffect, useState, useCallback } from "react";
import { useParams } from "react-router";
import { ChevronsDown } from "lucide-react";
import type {
  InstanceId,
  ImagePayload,
  ThinkingLevel,
} from "../../../../protocol/types";
import { getSessionEntryRenderKey } from "../../stores/types";
import { useWebSocket } from "../../stores/useWebSocket";
import { useInstances, selectInstance } from "../../stores/useInstances";
import { useDrafts, EMPTY_DRAFT } from "../../stores/useDrafts";
import { isBusy } from "../../utils/status";
import { EntryItem } from "../entries";
import { ImageLightbox } from "../ui/ImageLightbox";
import { MobileNavBar } from "../ui/MobileNavBar";
import { InstanceHeader } from "../ui/InstanceHeader";
import { SessionPopover } from "../ui/SessionPopover";
import { useTranslation } from "react-i18next";
import { Composer } from "./Composer";
import { useConversation } from "./useConversation";
import { useScrollAnchor } from "./useScrollAnchor";
import { useReEdit } from "./useReEdit";
import { getConversationScrollSpacing, getComposerButtonMode } from "./utils";

export function InstanceView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const instanceId = id as InstanceId;

  // ── 全局 stores ──
  const send = useWebSocket((s) => s.send);
  const instance = useInstances(selectInstance(instanceId));
  const draft = useDrafts((s) => s.drafts.get(instanceId) ?? EMPTY_DRAFT);
  const setDraft = useDrafts((s) => s.setDraft);

  // ── 对话状态（私有 hook） ──
  const {
    entries,
    isStreaming,
    loadState,
    errorMessage,
    hasMore,
    sessionList,
    sessionListLoading,
    sessionHasMore,
    sessionTotal,
    loadMore,
    requestSessionList,
  } = useConversation(instanceId, instance);

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
  const onReEdit = useReEdit(instanceId, entries, instance?.status);

  // ── 滚动管理 ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const topChromeRef = useRef<HTMLDivElement>(null);
  const bottomChromeRef = useRef<HTMLDivElement>(null);
  const bottomSafeGapRef = useRef<HTMLDivElement>(null);
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

  // Chrome 高度测量
  const [topChromeHeight, setTopChromeHeight] = useState(64);
  const [bottomChromeHeight, setBottomChromeHeight] = useState(96);
  const [bottomSafeGap, setBottomSafeGap] = useState(12);
  const scrollSpacing = getConversationScrollSpacing({
    topChromeHeight,
    bottomChromeHeight,
    bottomSafeGap,
  });

  useLayoutEffect(() => {
    const observeHeight = (
      element: HTMLElement | null,
      setHeight: (height: number) => void,
    ) => {
      if (!element) return () => undefined;
      const updateHeight = () => {
        setHeight(Math.ceil(element.getBoundingClientRect().height));
      };
      updateHeight();
      if (typeof ResizeObserver === "undefined") return () => undefined;
      const observer = new ResizeObserver(updateHeight);
      observer.observe(element);
      return () => observer.disconnect();
    };

    const cleanupTop = observeHeight(topChromeRef.current, setTopChromeHeight);
    const cleanupBottom = observeHeight(
      bottomChromeRef.current,
      setBottomChromeHeight,
    );
    const cleanupSafeGap = observeHeight(
      bottomSafeGapRef.current,
      setBottomSafeGap,
    );

    return () => {
      cleanupTop();
      cleanupBottom();
      cleanupSafeGap();
    };
  }, [instanceId]);

  // 滚动 hook
  const { handleScroll, scrollToBottom, showScrollBtn, startBottomFollow } =
    useScrollAnchor({
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
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-3 pt-3 md:px-4 md:pt-4">
          <div
            ref={topChromeRef}
            className="glass-panel pointer-events-auto mx-auto w-full max-w-[920px] px-3 py-2 md:px-4 md:py-2.5"
            role="region"
            aria-label="Instance info"
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
          style={{ overflowAnchor: "none" }}
          aria-busy={isRefreshing}
          className="absolute bottom-[var(--bottom-safe-gap)] left-0 right-0 top-6 overflow-y-auto scrollbar-auto px-3 md:bottom-0 md:top-7 md:px-4"
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
              <div className="text-center text-[var(--label-tertiary)] text-[11px] py-2 select-none">
                Loading earlier messages...
              </div>
            )}
            {isRefreshing ? (
              <RefreshingConversationSkeleton />
            ) : loadState === "error" ? (
              <div className="mx-auto mt-8 max-w-[520px] rounded-[12px] border border-[var(--separator)] bg-[var(--fill-card)] px-4 py-3 text-center">
                <div className="text-[13px] text-[var(--label-primary)] select-none">
                  Failed to load conversation
                </div>
                {errorMessage && (
                  <div className="mt-1 text-[12px] text-[var(--label-secondary)] break-words select-text">
                    {errorMessage}
                  </div>
                )}
              </div>
            ) : entries.length === 0 && !hasMore ? (
              <div className="text-center text-[var(--label-tertiary)] text-[12px] pt-8 select-none">
                No messages yet
              </div>
            ) : (
              entries.map((entry, i) => {
                const key = getSessionEntryRenderKey(entry);
                const isLast = i === entries.length - 1;
                return (
                  <div key={key} data-entry-key={key}>
                    <EntryItem
                      entry={entry}
                      entries={entries}
                      isLast={isLast}
                      isStreaming={isStreaming}
                      onReEdit={isLast ? onReEdit : undefined}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 快速滚动到底部按钮 */}
        {showScrollBtn && (
          <div
            style={{ bottom: scrollSpacing.scrollButtonBottom }}
            className="absolute left-1/2 z-30 -translate-x-1/2"
          >
            <button
              onClick={scrollToBottom}
              className="select-none w-9 h-9 rounded-full bg-[var(--btn-solid)] border border-[var(--separator)] text-[var(--label-secondary)] flex items-center justify-center hover:bg-[var(--btn-solid-hover)] active:scale-95 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
              title={t("eventStream.scrollToBottom")}
            >
              <ChevronsDown size={16} />
            </button>
          </div>
        )}

        {/* 底部悬浮输入区 */}
        <div
          ref={bottomChromeRef}
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-3 pb-0 md:px-4"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[920px]">
            <Composer
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
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}

// ─── 内部子组件 ──────────────────────────────────────────────────

function RefreshingConversationSkeleton() {
  return (
    <div
      className="space-y-3 pt-3 select-none"
      aria-label="Loading conversation"
    >
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="space-y-1.5 animate-pulse">
          <div className="h-3 w-20 rounded-full bg-[var(--fill-tertiary)]" />
          <div className="max-w-[680px] space-y-1.5 rounded-[10px] border border-[var(--separator)] bg-[var(--fill-card)] p-3">
            <div className="h-3 w-[82%] rounded-full bg-[var(--fill-secondary)]" />
            <div className="h-3 w-[64%] rounded-full bg-[var(--fill-tertiary)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
