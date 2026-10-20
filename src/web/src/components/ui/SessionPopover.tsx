// Session 切换 Popover：列出历史 session，支持新建、切换、分页加载和服务端搜索

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./Button";
import { TextField } from "./FormControls";
import { MenuItem } from "./MenuItem";
import { StatusMessage } from "./StatusMessage";
import { Plus, History, Loader2 } from "lucide-react";
import type { TFunction } from "i18next";
import type { SessionListItem } from "../../../../protocol/types";
import { Popover } from "./Popover";
import { useTranslation } from "react-i18next";

interface SessionPopoverProps {
  sessions: SessionListItem[];
  loading: boolean;
  hasMore: boolean;
  total: number;
  disabled: boolean;
  onOpen: () => void;
  onNewSession: () => void;
  onSwitchSession: (path: string) => void;
  onLoadMore: (offset: number, filter?: string) => void;
  onFilterChange: (filter: string) => void;
}

/** 格式化相对时间 */
function formatRelativeTime(isoString: string, t: TFunction): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t("session.timeJustNow");
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w`;
  return date.toLocaleDateString();
}

export function SessionPopover({
  sessions,
  loading,
  hasMore,
  total,
  disabled,
  onOpen,
  onNewSession,
  onSwitchSession,
  onLoadMore,
  onFilterChange,
}: SessionPopoverProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // 输入变化时 debounce 触发服务端搜索
  const handleFilterChange = useCallback(
    (value: string) => {
      setFilter(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFilterChange(value);
      }, 300);
    },
    [onFilterChange],
  );

  // 滚动触底加载更多
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!hasMore || loading) return;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) {
        onLoadMore(sessions.length, filter);
      }
    },
    [hasMore, loading, sessions.length, filter, onLoadMore],
  );

  return (
    <Popover
      label={t("session.title")}
      trigger={({ open, id }) => (
        <Button
          size="icon"
          type="button"
          disabled={disabled}
          aria-label={t("session.title")}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          className={`flex items-center justify-center rounded-[10px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
            open
              ? "bg-[var(--fill-secondary)]"
              : "hover:bg-[var(--fill-tertiary)]"
          } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
          title={t("session.title")}
          onClick={() => {
            if (!open) {
              setFilter("");
              onOpen();
            }
          }}
        >
          <History
            size={18}
            className="text-[var(--label-secondary)]"
            aria-hidden="true"
          />
        </Button>
      )}
      width={320}
      disabled={disabled}
      placement="bottom"
    >
      {(close) => (
        <div className="ui-menu-layout">
          {/* 头部：标题 + 新建按钮 */}
          <div className="ui-menu-heading">
            <span className="text-[13px] font-medium text-[var(--label-primary)] select-none">
              {t("session.title")}
              {total > 0 && (
                <span className="ml-1.5 text-[11px] font-normal text-[var(--label-tertiary)]">
                  ({total})
                </span>
              )}
            </span>
            <Button
              size="compact"
              variant="secondary"
              onClick={() => {
                onNewSession();
                close();
              }}
              disabled={disabled}
            >
              <Plus size={12} />
              <span>{t("session.new")}</span>
            </Button>
          </div>

          {/* 搜索栏 */}
          <div className="px-3 pb-2">
            <TextField
              aria-label={t("session.filter")}
              type="text"
              placeholder={t("session.filter")}
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              autoFocus
            />
          </div>

          {/* 分隔线 */}
          <div className="h-px bg-[var(--separator)] mx-2" />

          {/* 列表 */}
          <div
            ref={listRef}
            className="ui-menu-scroll flex-1 scrollbar-auto"
            onScroll={handleScroll}
          >
            {loading && sessions.length === 0 ? (
              <StatusMessage tone="loading">
                {t("common.loading")}
              </StatusMessage>
            ) : sessions.length === 0 ? (
              <StatusMessage>
                {filter ? t("session.noMatch") : t("session.noPrevious")}
              </StatusMessage>
            ) : (
              <>
                {sessions.map((session) => (
                  <MenuItem
                    selected={session.isCurrent}
                    aria-current={session.isCurrent || undefined}
                    key={session.id}
                    onClick={() => {
                      if (!session.isCurrent) {
                        onSwitchSession(session.path);
                        close();
                      }
                    }}
                    disabled={session.isCurrent}
                    className="flex-col items-stretch gap-0.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[14px] leading-[20px] truncate ${
                          session.isCurrent
                            ? "font-medium text-[var(--color-accent)]"
                            : "text-[var(--label-primary)]"
                        }`}
                      >
                        {session.name ||
                          session.firstMessage ||
                          t("session.empty")}
                      </span>
                      <span className="text-[12px] text-[var(--label-secondary)] whitespace-nowrap shrink-0">
                        {formatRelativeTime(session.modified, t)}
                      </span>
                    </div>
                    {session.name && session.firstMessage && (
                      <div className="mt-0.5 text-[12px] leading-[18px] text-[var(--label-secondary)] truncate">
                        {session.firstMessage}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-[var(--label-secondary)]">
                      {t("session.messageCount", {
                        count: session.messageCount,
                      })}
                    </div>
                  </MenuItem>
                ))}
                {/* 加载更多指示器 */}
                {loading && sessions.length > 0 && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2
                      size={14}
                      className="animate-spin text-[var(--label-tertiary)]"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
