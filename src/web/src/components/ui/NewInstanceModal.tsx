// 新建实例弹窗：选择 Edge + 输入工作目录（带目录自动补全），在指定 Edge 上 spawn 一个 pi 实例

import { useState, useRef, useEffect, useCallback } from "react";
import { FolderPlus, Folder, Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { authFetch } from "../../utils/authFetch";
import type {
  InstanceId,
  EdgeInfo,
  BrowseEntry,
} from "../../../../protocol/types";
import { useTranslation } from "react-i18next";

// ─── PathAutocomplete ────────────────────────────────────────────────────────
// 路径自动补全输入框：输入时通过 Edge browse API 列出匹配的子目录
//
// 支持类似 VS Code Quick Open 的目录浏览：
// - 以 "/" 结尾列出该目录全部子目录
// - 否则以最后一段作为前缀过滤
// - 键盘导航（↑↓ 选择，Tab/Enter 补全，Enter 无高亮时触发 onSubmit）

interface PathAutocompleteProps {
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

function PathAutocomplete({
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
    };
  }, []);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
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
        <input
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
          className="w-full rounded-[10px] px-3 py-2 bg-[var(--fill-tertiary)] border border-[var(--separator)] text-[14px] leading-[20px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 pr-8"
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
          className="max-h-[200px] overflow-y-auto rounded-[10px] border border-[var(--separator)] bg-[var(--fill-quaternary)]"
        >
          {suggestions.map((entry, i) => (
            <button
              key={entry.name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(entry);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors ${
                i === highlightIndex
                  ? "bg-[var(--fill-secondary)]"
                  : "hover:bg-[var(--fill-tertiary)]"
              }`}
            >
              <Folder
                size={14}
                className="shrink-0 text-[var(--label-tertiary)]"
              />
              <span className="text-[var(--label-primary)] truncate">
                {entry.name}
              </span>
            </button>
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

// ─── NewInstanceModal ────────────────────────────────────────────────────────

interface NewInstanceModalProps {
  onClose: () => void;
  /** 创建成功后回调（携带新实例 id） */
  onCreated: (id: InstanceId) => void;
}

export function NewInstanceModal({
  onClose,
  onCreated,
}: NewInstanceModalProps) {
  const { t } = useTranslation();
  const [cwd, setCwd] = useState("");
  const [edges, setEdges] = useState<EdgeInfo[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [loadingEdges, setLoadingEdges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载可用的 Edge 列表
  useEffect(() => {
    authFetch("/api/edges")
      .then((res) => res.json())
      .then((data: { edges: EdgeInfo[] }) => {
        setEdges(data.edges);
        if (data.edges.length > 0) {
          setSelectedEdgeId(data.edges[0].edgeId);
          const homedir = data.edges[0].homedir;
          if (homedir) {
            const defaultPath = homedir.endsWith("/") ? homedir : homedir + "/";
            setCwd(defaultPath);
          }
        }
        setLoadingEdges(false);
      })
      .catch(() => {
        setLoadingEdges(false);
        setError(t("newInstance.fetchEdgeError"));
      });
  }, []);

  // Edge 切换时更新默认路径
  const handleEdgeChange = useCallback(
    (edgeId: string) => {
      setSelectedEdgeId(edgeId);
      const edge = edges.find((e) => e.edgeId === edgeId);
      if (edge?.homedir) {
        const defaultPath = edge.homedir.endsWith("/")
          ? edge.homedir
          : edge.homedir + "/";
        setCwd(defaultPath);
      }
    },
    [edges],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = cwd.trim();
    if (!trimmed || submitting) return;
    if (!selectedEdgeId) {
      setError(t("newInstance.noEdgeSelected"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: trimmed, edgeId: selectedEdgeId }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json()) as {
        instanceId?: InstanceId;
        error?: string;
      };
      if (!res.ok || !data.instanceId) {
        setError(
          data.error || t("newInstance.requestFailed", { status: res.status }),
        );
        setSubmitting(false);
        return;
      }
      onCreated(data.instanceId);
    } catch (err) {
      const message =
        (err as Error).name === "TimeoutError"
          ? t("newInstance.requestTimeout")
          : (err as Error).message || t("newInstance.networkError");
      setError(message);
      setSubmitting(false);
    }
  }, [cwd, submitting, selectedEdgeId, onCreated]);

  return (
    <ModalShell
      title={
        <>
          <FolderPlus size={16} />
          <span>{t("newInstance.title")}</span>
        </>
      }
      onClose={onClose}
    >
      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Edge 选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-[var(--label-secondary)]">
            {t("newInstance.edgeNode")}
          </label>
          {loadingEdges ? (
            <div className="text-[13px] text-[var(--label-tertiary)]">
              {t("common.loading")}
            </div>
          ) : edges.length === 0 ? (
            <div className="text-[12px] text-[#ff4245]">
              {t("newInstance.noEdges")}
            </div>
          ) : edges.length === 1 ? (
            <div className="text-[13px] text-[var(--label-primary)]">
              {edges[0].hostname}
              <span className="text-[var(--label-tertiary)] ml-1.5">
                ({edges[0].edgeId})
              </span>
            </div>
          ) : (
            <select
              value={selectedEdgeId}
              onChange={(e) => handleEdgeChange(e.target.value)}
              disabled={submitting}
              className="w-full rounded-[10px] px-3 py-2 bg-[var(--fill-tertiary)] border border-[var(--separator)] text-[14px] text-[var(--label-primary)] outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50"
            >
              {edges.map((edge) => (
                <option key={edge.edgeId} value={edge.edgeId}>
                  {edge.hostname} ({edge.edgeId})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 工作目录 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-[var(--label-secondary)]">
            {t("newInstance.workingDir")}
          </label>
          <PathAutocomplete
            value={cwd}
            onChange={setCwd}
            edgeId={selectedEdgeId}
            disabled={submitting || loadingEdges}
            autoFocus={!loadingEdges}
            onSubmit={handleSubmit}
          />
        </div>

        {error && (
          <div className="text-[12px] leading-[16px] text-[#ff4245] whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !cwd.trim() || !selectedEdgeId}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? t("newInstance.creating") : t("newInstance.create")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
