// Session 切换 Popover：列出历史 session，支持新建和切换

import { useState, useMemo } from "react";
import { Plus, History, Loader2 } from "lucide-react";
import type { TFunction } from "i18next";
import type { SessionListItem } from "../../../../protocol/types";
import { Popover } from "./Popover";
import { useTranslation } from "react-i18next";

interface SessionPopoverProps {
  sessions: SessionListItem[];
  loading: boolean;
  disabled: boolean;
  onOpen: () => void;
  onNewSession: () => void;
  onSwitchSession: (path: string) => void;
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
  disabled,
  onOpen,
  onNewSession,
  onSwitchSession,
}: SessionPopoverProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return sessions;
    const q = filter.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.name?.toLowerCase().includes(q) ?? false) ||
        s.firstMessage.toLowerCase().includes(q),
    );
  }, [sessions, filter]);

  return (
    <Popover
      trigger={({ open }) => (
        <button
          className={`flex items-center justify-center w-9 h-9 rounded-[8px] transition-colors ${
            open
              ? "bg-[rgba(0,0,0,0.11)] dark:bg-[rgba(255,255,255,0.11)]"
              : "hover:bg-[var(--fill-tertiary)]"
          } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
          title={t("session.title")}
          onClick={() => {
            if (!open) onOpen();
          }}
        >
          <History size={16} className="text-[var(--label-secondary)]" />
        </button>
      )}
      width={320}
      disabled={disabled}
      placement="bottom"
    >
      {(close) => (
        <div className="flex flex-col max-h-[360px]">
          {/* 头部：标题 + 新建按钮 */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2">
            <span className="text-[13px] font-medium text-[var(--label-primary)] select-none">
              {t("session.title")}
            </span>
            <button
              onClick={() => {
                onNewSession();
                close();
              }}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[12px] text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-40"
            >
              <Plus size={12} />
              <span>{t("session.new")}</span>
            </button>
          </div>

          {/* 搜索栏 */}
          {sessions.length > 3 && (
            <div className="px-3 pb-2">
              <input
                type="text"
                placeholder={t("session.filter")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-[6px] bg-[var(--fill-tertiary)] text-[12px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none border border-transparent focus:border-[var(--separator)]"
                autoFocus
              />
            </div>
          )}

          {/* 分隔线 */}
          <div className="h-px bg-[var(--separator)] mx-2" />

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto scrollbar-auto py-1.5 px-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2
                  size={16}
                  className="animate-spin text-[var(--label-tertiary)]"
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-[var(--label-tertiary)] select-none">
                {filter ? t("session.noMatch") : t("session.noPrevious")}
              </div>
            ) : (
              filtered.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    if (!session.isCurrent) {
                      onSwitchSession(session.path);
                      close();
                    }
                  }}
                  disabled={session.isCurrent}
                  className={`w-full text-left px-2.5 py-2 rounded-[8px] transition-colors mb-0.5 ${
                    session.isCurrent
                      ? "bg-[var(--fill-secondary)] cursor-default"
                      : "hover:bg-[var(--fill-tertiary)] cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[13px] leading-[18px] truncate ${
                        session.isCurrent
                          ? "font-medium text-[var(--color-accent)]"
                          : "text-[var(--label-primary)]"
                      }`}
                    >
                      {session.name ||
                        session.firstMessage ||
                        t("session.empty")}
                    </span>
                    <span className="text-[11px] text-[var(--label-tertiary)] whitespace-nowrap shrink-0">
                      {formatRelativeTime(session.modified, t)}
                    </span>
                  </div>
                  {session.name && session.firstMessage && (
                    <div className="mt-0.5 text-[11px] leading-[15px] text-[var(--label-tertiary)] truncate">
                      {session.firstMessage}
                    </div>
                  )}
                  <div className="mt-0.5 text-[10px] text-[var(--label-quaternary)]">
                    {t("session.messageCount", { count: session.messageCount })}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
