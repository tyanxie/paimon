// 实例详情页：顶栏 + 消息列表 + 输入区

import { useRef, useLayoutEffect, useState } from "react";
import { ChevronsDown } from "lucide-react";
import type {
  InstanceId,
  ContextUsageInfo,
  ImagePayload,
  ModelInfo,
  ThinkingLevel,
  SessionListItem,
  InstanceStatus,
} from "../../../../protocol/types";
import {
  getSessionEntryRenderKey,
  type ConversationLoadState,
  type SessionEntry,
  type InputDraft,
  type InputDraftUpdater,
} from "../../stores/useAppState";
import { useLogoSrc } from "../../hooks/useLogoSrc";
import { isBusy } from "../../utils/status";
import { EntryItem } from "../entries";
import { ImageLightbox } from "../ui/ImageLightbox";
import { MobileNavBar } from "../ui/MobileNavBar";
import { InstanceHeader } from "../ui/InstanceHeader";
import { SessionPopover } from "../ui/SessionPopover";
import { useTranslation } from "react-i18next";
import { Composer } from "./Composer";
import { useScrollAnchor } from "./useScrollAnchor";
import { getConversationScrollSpacing, getComposerButtonMode } from "./utils";

export interface InstanceViewProps {
  entries: SessionEntry[];
  instanceId: InstanceId | null;
  isStreaming: boolean;
  loadState: ConversationLoadState;
  errorMessage: string | null;
  shouldScrollToBottom: boolean;
  onScrollToBottomHandled: () => void;
  draft: InputDraft;
  onDraftChange: (value: InputDraftUpdater) => void;
  onSendMessage: (message: string, images?: ImagePayload[]) => void;
  onAbort: () => void;
  onSetModel?: (provider: string, id: string) => void;
  onSetThinkingLevel?: (level: ThinkingLevel) => void;
  instanceStatus?: InstanceStatus;
  hasMore?: boolean;
  onLoadMore?: () => void;
  contextUsage?: ContextUsageInfo;
  gitBranch?: string | null;
  instanceCwd?: string;
  instanceHomedir?: string;
  instanceName?: string;
  instanceModel?: ModelInfo;
  availableModels?: ModelInfo[];
  thinkingLevel?: ThinkingLevel;
  sessionList?: SessionListItem[];
  sessionListLoading?: boolean;
  onListSessions?: () => void;
  onNewSession?: () => void;
  onSwitchSession?: (path: string) => void;
  onCompact?: (customInstructions?: string) => void;
}

export function InstanceView({
  entries,
  instanceId,
  isStreaming,
  loadState,
  errorMessage,
  shouldScrollToBottom,
  onScrollToBottomHandled,
  draft,
  onDraftChange,
  onSendMessage,
  onAbort,
  onSetModel,
  onSetThinkingLevel,
  instanceStatus,
  hasMore = false,
  onLoadMore,
  contextUsage,
  gitBranch,
  instanceCwd,
  instanceHomedir,
  instanceName,
  instanceModel,
  availableModels,
  thinkingLevel,
  sessionList = [],
  sessionListLoading = false,
  onListSessions,
  onNewSession,
  onSwitchSession,
  onCompact,
}: InstanceViewProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const topChromeRef = useRef<HTMLDivElement>(null);
  const bottomChromeRef = useRef<HTMLDivElement>(null);
  const bottomSafeGapRef = useRef<HTMLDivElement>(null);
  const logoSrc = useLogoSrc();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const isRefreshing = loadState === "refreshing";
  const composerButtonMode = getComposerButtonMode(instanceStatus);
  // 上下文信息 + 压缩按钮作为整体：tokens 有值时同时展示，最后一条是 compaction entry 时不显示压缩按钮（无内容可压缩）
  const lastEntryIsCompaction =
    entries.length > 0 && entries[entries.length - 1].type === "compaction";
  const compactDisabled = isBusy(instanceStatus);
  const [topChromeHeight, setTopChromeHeight] = useState(64);
  const [bottomChromeHeight, setBottomChromeHeight] = useState(96);
  const [bottomSafeGap, setBottomSafeGap] = useState(12);
  const scrollSpacing = getConversationScrollSpacing({
    topChromeHeight,
    bottomChromeHeight,
    bottomSafeGap,
  });

  // Chrome 高度测量
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

  // 滚动管理
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
      onScrollToBottomHandled,
      onLoadMore,
      bottomChromeHeight,
      bottomSafeGap,
    });

  // 空状态
  if (!instanceId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center select-none">
          <img
            src={logoSrc}
            alt="Paimon"
            className="w-16 h-16 mx-auto mb-4 opacity-80"
          />
          <div className="text-[14px] text-[var(--label-tertiary)] tracking-wide">
            {t("eventStream.tagline")}
          </div>
        </div>
      </div>
    );
  }

  const title = instanceName || "";

  // 实例顶栏 props（PC 和移动端共用）
  const instanceHeaderProps = {
    title,
    cwd: instanceCwd,
    homedir: instanceHomedir,
    gitBranch,
    actions:
      onListSessions && onNewSession && onSwitchSession ? (
        <SessionPopover
          sessions={sessionList}
          loading={sessionListLoading}
          disabled={isBusy(instanceStatus)}
          onOpen={onListSessions}
          onNewSession={onNewSession}
          onSwitchSession={onSwitchSession}
        />
      ) : undefined,
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
            {/* PC 端：直接展示 InstanceHeader */}
            <div className="hidden md:flex">
              <InstanceHeader {...instanceHeaderProps} />
            </div>
            {/* 移动端：MobileNavBar 壳 + InstanceHeader 内容 */}
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
                return (
                  <div key={key} data-entry-key={key}>
                    <EntryItem
                      entry={entry}
                      entries={entries}
                      isLast={i === entries.length - 1}
                      isStreaming={isStreaming}
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
              draft={draft}
              onDraftChange={onDraftChange}
              onSendMessage={onSendMessage}
              onAbort={onAbort}
              instanceStatus={instanceStatus}
              buttonMode={composerButtonMode}
              contextUsage={contextUsage}
              showCompactButton={!lastEntryIsCompaction && !!onCompact}
              compactDisabled={compactDisabled}
              onCompact={onCompact}
              instanceModel={instanceModel}
              availableModels={availableModels}
              thinkingLevel={thinkingLevel}
              onSetModel={onSetModel}
              onSetThinkingLevel={onSetThinkingLevel}
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
