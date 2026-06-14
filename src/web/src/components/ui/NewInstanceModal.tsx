// 新建实例弹窗：选择 Edge + 输入工作目录（带目录自动补全），在指定 Edge 上 spawn 一个 pi 实例
//
// 路径输入支持类似 VS Code Quick Open 的目录浏览：
// - 输入路径时自动列出匹配的子目录
// - 以 "/" 结尾列出该目录全部子目录
// - 否则以最后一段作为前缀过滤
// - 支持键盘导航（↑↓ 选择，Tab/Enter 补全，Enter 无高亮时提交）

import { useState, useRef, useEffect, useCallback } from "react";
import { FolderPlus, Folder, Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";
import type {
  InstanceId,
  EdgeInfo,
  BrowseEntry,
} from "../../../../protocol/types";

interface NewInstanceModalProps {
  onClose: () => void;
  /** 创建成功后回调（携带新实例 id） */
  onCreated: (id: InstanceId) => void;
}

/** 浏览 API 响应 */
interface BrowseResponse {
  parent: string;
  entries: BrowseEntry[];
  truncated: boolean;
  error?: string;
}

export function NewInstanceModal({
  onClose,
  onCreated,
}: NewInstanceModalProps) {
  const [cwd, setCwd] = useState("");
  const [edges, setEdges] = useState<EdgeInfo[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
  const [loadingEdges, setLoadingEdges] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 目录补全状态
  const [suggestions, setSuggestions] = useState<BrowseEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const browseAbortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<Timer | null>(null);

  // 加载可用的 Edge 列表
  useEffect(() => {
    fetch("/api/edges")
      .then((res) => res.json())
      .then((data: { edges: EdgeInfo[] }) => {
        setEdges(data.edges);
        if (data.edges.length > 0) {
          setSelectedEdgeId(data.edges[0].edgeId);
          // 用第一个 Edge 的 homedir 作为默认路径
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
        setError("Failed to fetch edge list");
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
        setSuggestions([]);
        setShowSuggestions(false);
      }
    },
    [edges],
  );

  // 组件卸载时中止进行中的 browse 请求
  useEffect(() => {
    return () => {
      browseAbortRef.current?.abort();
    };
  }, []);

  // 聚焦输入框
  useEffect(() => {
    if (!loadingEdges) {
      inputRef.current?.focus();
    }
  }, [loadingEdges]);

  // 请求目录补全
  const fetchSuggestions = useCallback(async (edgeId: string, path: string) => {
    // 取消之前的请求
    if (browseAbortRef.current) {
      browseAbortRef.current.abort();
    }
    const controller = new AbortController();
    browseAbortRef.current = controller;

    setBrowsing(true);
    try {
      const res = await fetch(
        `/api/edges/${encodeURIComponent(edgeId)}/browse?path=${encodeURIComponent(path)}`,
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

  // cwd 变化时触发目录浏览（防抖）
  useEffect(() => {
    if (!selectedEdgeId || !cwd || !cwd.startsWith("/")) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // 防抖 250ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(selectedEdgeId, cwd);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cwd, selectedEdgeId, fetchSuggestions]);

  // 选择补全项
  const selectSuggestion = useCallback(
    (entry: BrowseEntry) => {
      // 构建新路径：parent + entry.name + "/"
      const endsWithSlash = cwd.endsWith("/");
      const parent = endsWithSlash
        ? cwd
        : cwd.substring(0, cwd.lastIndexOf("/") + 1);
      const newPath = parent + entry.name + "/";
      setCwd(newPath);
      setHighlightIndex(-1);
      // 聚焦回输入框
      inputRef.current?.focus();
    },
    [cwd],
  );

  const handleSubmit = useCallback(async () => {
    const trimmed = cwd.trim();
    if (!trimmed || submitting) return;
    if (!selectedEdgeId) {
      setError("No edge selected");
      return;
    }
    setSubmitting(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const res = await fetch("/api/instances", {
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
        setError(data.error || `Request failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      onCreated(data.instanceId);
    } catch (err) {
      const message =
        (err as Error).name === "TimeoutError"
          ? "Request timed out"
          : (err as Error).message || "Network error";
      setError(message);
      setSubmitting(false);
    }
  }, [cwd, submitting, selectedEdgeId, onCreated]);

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
            // 只有一个选项时 Tab 直接选中
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
          // 无高亮时走提交逻辑
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSuggestions(false);
          setHighlightIndex(-1);
          return;
        }
      }

      // Enter 提交（无高亮时）
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [
      showSuggestions,
      suggestions,
      highlightIndex,
      selectSuggestion,
      handleSubmit,
    ],
  );

  // 高亮项变化时滚动可见
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const items = listRef.current.children;
    const item = items[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  return (
    <ModalShell
      title={
        <>
          <FolderPlus size={16} />
          <span>新建实例</span>
        </>
      }
      onClose={onClose}
    >
      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Edge 选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] text-[var(--label-secondary)]">
            Edge 节点
          </label>
          {loadingEdges ? (
            <div className="text-[13px] text-[var(--label-tertiary)]">
              加载中…
            </div>
          ) : edges.length === 0 ? (
            <div className="text-[12px] text-[#ff4245]">
              没有可用的 Edge 节点
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
            工作目录
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => {
                // 延迟关闭，给 mousedown 事件留时间触发补全选择
                setTimeout(() => setShowSuggestions(false), 150);
              }}
              placeholder="/path/to/your/project"
              disabled={submitting || loadingEdges}
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
                    // 用 mousedown 防止 input blur 导致列表消失
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
              {/* 截断提示 */}
              {truncated && (
                <div className="px-3 py-1.5 text-[12px] text-[var(--label-tertiary)] border-t border-[var(--separator)]">
                  输入更多字符以缩小范围…
                </div>
              )}
            </div>
          )}
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
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !cwd.trim() || !selectedEdgeId}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
