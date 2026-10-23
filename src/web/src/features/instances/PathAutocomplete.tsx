import type { BrowseEntry } from "@protocol/types";
import { Folder, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../../components/ui/FormControls";
import { MenuItem } from "../../components/ui/MenuItem";
import { authFetch } from "../../utils/authFetch";

// ─── PathAutocomplete ────────────────────────────────────────────────────────
// 路径自动补全输入框：输入时通过 Edge browse API 列出匹配的子目录
//
// 支持类似 VS Code Quick Open 的目录浏览：
// - 以 "/" 结尾列出该目录全部子目录
// - 否则以最后一段作为前缀过滤
// - 键盘导航（↑↓ 选择，Tab/Enter 补全，Enter 无高亮时触发 onSubmit）

interface PathAutocompleteProps {
  id: string;
  value: string;
  onChange: (path: string) => void;
  /** 目标 Edge 节点 ID，用于调 browse API */
  edgeId: string;
  disabled?: boolean;
  /** 自动聚焦 */
  autoFocus?: boolean;
  /** Enter 无高亮时向上冒泡（用于提交表单） */
  onSubmit?: () => void;
}

/** 浏览 API 响应 */
interface BrowseResponse {
  parent: string;
  entries: BrowseEntry[];
  truncated: boolean;
  error?: string;
}

export function PathAutocomplete({
  id,
  value,
  onChange,
  edgeId,
  disabled = false,
  autoFocus = false,
  onSubmit,
}: PathAutocompleteProps) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<BrowseEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const browseAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<Timer | null>(null);

  // 组件卸载时中止进行中的 browse 请求
  useEffect(() => {
    return () => {
      browseAbortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && !window.matchMedia("(pointer: coarse)").matches) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // 请求目录补全
  const fetchSuggestions = useCallback(async (eid: string, path: string) => {
    if (browseAbortRef.current) browseAbortRef.current.abort();
    const controller = new AbortController();
    browseAbortRef.current = controller;

    setBrowsing(true);
    try {
      const res = await authFetch(
        `/api/edges/${encodeURIComponent(eid)}/browse?path=${encodeURIComponent(path)}`,
        { signal: controller.signal },
      );
      const data = (await res.json()) as BrowseResponse;

      if (controller.signal.aborted) return;

      if (data.error) {
        setSuggestions([]);
        setTruncated(false);
        setShowSuggestions(false);
      } else {
        setSuggestions(data.entries ?? []);
        setTruncated(data.truncated ?? false);
        setShowSuggestions((data.entries ?? []).length > 0 || data.truncated);
      }
      setHighlightIndex(-1);
    } catch {
      if (!controller.signal.aborted) {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } finally {
      if (!controller.signal.aborted) {
        setBrowsing(false);
      }
    }
  }, []);

  // value 变化时触发目录浏览（防抖 250ms）
  useEffect(() => {
    if (!edgeId || !value || !value.startsWith("/")) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(edgeId, value);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, edgeId, fetchSuggestions]);

  // 选择补全项：拼接路径并通知父组件
  const selectSuggestion = useCallback(
    (entry: BrowseEntry) => {
      const endsWithSlash = value.endsWith("/");
      const parent = endsWithSlash
        ? value
        : value.substring(0, value.lastIndexOf("/") + 1);
      const newPath = parent + entry.name + "/";
      onChange(newPath);
      setHighlightIndex(-1);
      inputRef.current?.focus();
    },
    [value, onChange],
  );

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (showSuggestions && suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
            selectSuggestion(suggestions[highlightIndex]);
          } else if (suggestions.length === 1) {
            selectSuggestion(suggestions[0]);
          }
          return;
        }
        if (e.key === "Enter") {
          if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
            e.preventDefault();
            selectSuggestion(suggestions[highlightIndex]);
            return;
          }
          // 无高亮时交给 onSubmit
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSuggestions(false);
          setHighlightIndex(-1);
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit?.();
      }
    },
    [showSuggestions, suggestions, highlightIndex, selectSuggestion, onSubmit],
  );

  // 高亮项变化时滚动可见
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const items = listRef.current.children;
    const item = items[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  // edgeId 变化时重置建议列表
  useEffect(() => {
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);
  }, [edgeId]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <TextField
          id={id}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onBlur={() => {
            // 延迟关闭，给 mousedown 事件留时间触发补全选择
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          placeholder={t("newInstance.pathPlaceholder")}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          className="pr-10"
        />
        {/* 加载指示器 */}
        {browsing && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <Loader2
              size={14}
              className="animate-spin text-[var(--label-tertiary)]"
            />
          </div>
        )}
      </div>

      {/* 补全建议列表 */}
      {showSuggestions && (
        <div
          ref={listRef}
          className="max-h-[200px] overflow-y-auto rounded-surface border border-[var(--separator)] bg-[var(--fill-quaternary)] p-1.5 scrollbar-auto"
        >
          {suggestions.map((entry, i) => (
            <MenuItem
              selected={i === highlightIndex}
              key={entry.name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(entry)}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <Folder
                size={14}
                className="shrink-0 text-[var(--label-tertiary)]"
              />
              <span className="text-[var(--label-primary)] truncate">
                {entry.name}
              </span>
            </MenuItem>
          ))}
          {truncated && (
            <div className="px-3 py-1.5 text-[12px] text-[var(--label-tertiary)] border-t border-[var(--separator)]">
              {t("newInstance.truncatedHint")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
