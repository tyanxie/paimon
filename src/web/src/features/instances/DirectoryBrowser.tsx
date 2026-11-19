import type { BrowseResult } from "@protocol/types";
import { ChevronRight, ChevronUp, Folder } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { FormField, TextField } from "../../components/ui/FormControls";
import { MenuItem } from "../../components/ui/MenuItem";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { authFetch } from "../../utils/authFetch";
import { isRecord } from "../../utils/typeGuards";
import { isBrowseResult } from "./instanceData";

interface DirectoryBrowserProps {
  id: string;
  value: string;
  onChange: (path: string) => void;
  edgeId: string;
  /** 列表不独立滚动时使用的正文容器 */
  scrollContainerRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  loadingEdge?: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
}

type DirectoryState = {
  edgeId: string;
  path: string;
} & (
  | { status: "loading" }
  | { status: "ready"; result: BrowseResult }
  | { status: "error"; message: string }
);

export function DirectoryBrowser({
  id,
  value,
  onChange,
  edgeId,
  scrollContainerRef,
  disabled = false,
  loadingEdge = false,
  autoFocus = false,
  onSubmit,
}: DirectoryBrowserProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<DirectoryState | null>(null);
  const [retry, setRetry] = useState(0);
  const [focusedEntry, setFocusedEntry] = useState<{
    edgeId: string;
    path: string;
    name: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const path = value.trim();
  const validPath = path.startsWith("/");
  // 结果必须属于当前 Edge 和路径，输入变化后的首帧也不能操作旧目录
  const current =
    state?.edgeId === edgeId && state.path === path ? state : null;
  const result = current?.status === "ready" ? current.result : null;
  const browsing =
    loadingEdge ||
    Boolean(edgeId && validPath && (!current || current.status === "loading"));
  // 上一级按输入路径计算，不从前缀筛选所读取的目录再向上跳
  const pathWithoutSlash = validPath ? path.replace(/\/+$/, "") : "";
  const parentPath = pathWithoutSlash
    ? pathWithoutSlash.slice(0, pathWithoutSlash.lastIndexOf("/") + 1) || "/"
    : null;
  const hasParent = Boolean(edgeId && parentPath);
  const directoryCount = (hasParent ? 1 : 0) + (result?.entries.length ?? 0);
  const focusedName =
    focusedEntry?.edgeId === edgeId && focusedEntry.path === path
      ? focusedEntry.name
      : hasParent
        ? ".."
        : result?.entries[0]?.name;
  const filtering = validPath && !path.endsWith("/");

  useEffect(() => {
    if (autoFocus && !window.matchMedia("(pointer: coarse)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!edgeId || !validPath) {
      setState(null);
      return;
    }
    const controller = new AbortController();
    setState({ edgeId, path, status: "loading" });
    if (listRef.current) listRef.current.scrollTop = 0;

    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(
          `/api/edges/${encodeURIComponent(edgeId)}/browse?path=${encodeURIComponent(path)}`,
          { signal: controller.signal },
        );
        const data: unknown = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok || (isRecord(data) && data.error)) {
          throw new Error(
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : t("newInstance.browseError"),
          );
        }
        if (!isBrowseResult(data))
          throw new Error(t("newInstance.browseError"));
        setState({ edgeId, path, status: "ready", result: data });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            edgeId,
            path,
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : t("newInstance.browseError"),
          });
        }
      }
    }, 250);

    // 防抖期间也取消旧请求，避免旧结果覆盖新路径的加载状态
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [edgeId, path, validPath, retry, t]);

  function navigateTo(nextPath: string) {
    // 将焦点留在持续存在的浏览区，目录行被替换时不丢失焦点，也不唤起输入键盘
    listRef.current?.focus({ preventScroll: true });
    onChange(nextPath);
  }

  function focusDirectory(index: number) {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>(
      ".ui-menu-item:not(:disabled)",
    );
    const item = items?.[index];
    if (!item) return;
    item.focus({ preventScroll: true });
    // 仅滚动当前内容容器，不让 scrollIntoView 同时移动外层窗口
    const list = listRef.current;
    if (!list) return;
    const scroller =
      list.scrollHeight > list.clientHeight ? list : scrollContainerRef.current;
    if (!scroller) return;
    const itemRect = item.getBoundingClientRect();
    const scrollRect = scroller.getBoundingClientRect();
    if (itemRect.top < scrollRect.top)
      scroller.scrollTop -= scrollRect.top - itemRect.top;
    else if (itemRect.bottom > scrollRect.bottom)
      scroller.scrollTop += itemRect.bottom - scrollRect.bottom;
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || directoryCount === 0) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        ".ui-menu-item:not(:disabled)",
      ),
    );
    const index = items.findIndex((item) => item === event.target);
    let nextIndex: number;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowUp")
      nextIndex = index <= 0 ? items.length - 1 : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;
    event.preventDefault();
    focusDirectory(nextIndex);
  }

  let statusText: string | null = null;
  if (browsing) statusText = t("newInstance.loadingDirectories");
  else if (!edgeId) statusText = t("newInstance.noEdgeSelected");
  else if (!validPath) statusText = t("newInstance.absolutePathHint");
  else if (result && result.entries.length === 0) {
    statusText = t(
      filtering
        ? "newInstance.noMatchingDirectories"
        : "newInstance.noSubdirectories",
    );
  }

  return (
    <div className="instance-directory-browser">
      <FormField label={t("newInstance.workingDir")} htmlFor={id}>
        <TextField
          id={id}
          ref={inputRef}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (
              directoryCount > 0 &&
              (event.key === "ArrowDown" || event.key === "ArrowUp")
            ) {
              event.preventDefault();
              focusDirectory(
                event.key === "ArrowDown" ? 0 : directoryCount - 1,
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              onSubmit?.();
            }
          }}
          aria-controls={`${id}-directories`}
          placeholder={t("newInstance.pathPlaceholder")}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </FormField>

      <div
        id={`${id}-directories`}
        ref={listRef}
        className="instance-directory-list scrollbar-auto"
        role="region"
        aria-label={t("newInstance.directories")}
        aria-busy={browsing}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
      >
        {hasParent && (
          <MenuItem
            disabled={disabled}
            aria-label={t("newInstance.parentDirectory")}
            title={t("newInstance.parentDirectory")}
            tabIndex={focusedName === ".." ? 0 : -1}
            onFocus={() => setFocusedEntry({ edgeId, path, name: ".." })}
            onClick={() => {
              if (parentPath) navigateTo(parentPath);
            }}
          >
            <Folder
              size={16}
              className="shrink-0 text-[var(--label-tertiary)]"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">..</span>
            <ChevronUp
              size={14}
              className="shrink-0 text-[var(--label-tertiary)]"
              aria-hidden="true"
            />
          </MenuItem>
        )}
        {statusText && (
          <StatusMessage
            compact
            tone={browsing ? "loading" : "neutral"}
            className="instance-directory-status"
          >
            {statusText}
          </StatusMessage>
        )}
        {current?.status === "error" && !statusText && (
          <div className="instance-directory-error">
            <StatusMessage compact tone="error" detail={current.message}>
              {t("newInstance.browseError")}
            </StatusMessage>
            <Button
              size="compact"
              disabled={disabled}
              onClick={() => setRetry((value) => value + 1)}
            >
              {t("newInstance.retry")}
            </Button>
          </div>
        )}
        {result?.entries.map((entry) => (
          <MenuItem
            key={entry.name}
            disabled={disabled}
            tabIndex={entry.name === focusedName ? 0 : -1}
            onFocus={() => setFocusedEntry({ edgeId, path, name: entry.name })}
            onClick={() => navigateTo(result.parent + entry.name + "/")}
          >
            <Folder
              size={16}
              className="shrink-0 text-[var(--label-tertiary)]"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <ChevronRight
              size={14}
              className="shrink-0 text-[var(--label-tertiary)]"
              aria-hidden="true"
            />
          </MenuItem>
        ))}
        {result?.truncated && (
          <div className="instance-directory-hint">
            {t("newInstance.truncatedHint")}
          </div>
        )}
      </div>
    </div>
  );
}
