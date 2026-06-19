// 实例顶栏内容：标题 + cwd + git 分支 + 右侧操作区（纯内容组件，不感知布局上下文）

import {
  type ReactNode,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { GitBranch, Folder, Check } from "lucide-react";

interface InstanceHeaderProps {
  title: string;
  /** 完整工作目录 */
  cwd?: string;
  /** 所在机器的 home 目录（用于 ~ 缩写） */
  homedir?: string;
  gitBranch?: string | null;
  /** 右侧操作区 */
  actions?: ReactNode;
}

/** 将 home 前缀替换为 ~ */
function abbreviatePath(fullPath: string, homedir?: string): string {
  if (homedir && fullPath.startsWith(homedir)) {
    const rest = fullPath.slice(homedir.length);
    if (!rest || rest === "/") return "~";
    return "~" + (rest.startsWith("/") ? rest : "/" + rest);
  }
  return fullPath;
}

/** 中间截断：保留头部和尾部，中间用 … 代替 */
function middleTruncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // 至少保留 1 个头字符 + 省略号
  const tail = Math.floor((maxLen - 1) / 2);
  const head = maxLen - 1 - tail;
  return text.slice(0, head) + "…" + text.slice(-tail);
}

/**
 * 计算目录路径应保留的末尾字符数（至少保留最后两级目录）。
 * 用于中间截断时确保尾部保留有意义的段。
 */
function getPathTailLen(displayPath: string): number {
  const segments = displayPath.split("/").filter(Boolean);
  if (segments.length <= 2) return displayPath.length;
  return segments.slice(-2).join("/").length;
}

/** 对路径做中间截断，保证至少保留最后两级目录 */
function truncatePath(displayPath: string, maxLen: number): string {
  if (displayPath.length <= maxLen) return displayPath;
  const tailLen = getPathTailLen(displayPath);
  // 如果能放下尾部 + 省略号 + 至少 1 个头字符
  if (tailLen + 2 <= maxLen) {
    const headLen = maxLen - 1 - tailLen;
    return displayPath.slice(0, headLen) + "…" + displayPath.slice(-tailLen);
  }
  // 兜底：普通中间截断
  return middleTruncate(displayPath, maxLen);
}

/** 11px 字号下单字符平均宽度（px），用于估算可容纳字符数 */
const CHAR_WIDTH_PX = 6.2;
/** 图标 + 间距占用的宽度（px） */
const ICON_SPACE_PX = 20;
/** 两个 CopyableInfo 之间的 gap（px） */
const GAP_PX = 8;

/** 可点击复制的元信息项（icon 点击后短暂变为 ✓），支持中间截断 */
function CopyableInfo({
  icon,
  text,
  copyText,
  title,
}: {
  icon: ReactNode;
  text: string;
  copyText: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清理 timer，避免对已卸载组件 setState
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [copyText]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title ?? copyText}
      className="inline-flex min-w-0 items-center gap-1 rounded-[4px] px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--fill-tertiary)] active:bg-[var(--fill-secondary)] cursor-pointer select-none"
    >
      <span className="shrink-0 opacity-70">
        {copied ? <Check size={11} className="text-green-500" /> : icon}
      </span>
      <span className="truncate">{text}</span>
    </button>
  );
}

export function InstanceHeader({
  title,
  cwd,
  homedir,
  gitBranch,
  actions,
}: InstanceHeaderProps) {
  const displayPath = cwd ? abbreviatePath(cwd, homedir) : null;

  // 监听元信息行宽度，动态计算可容纳字符数并做中间截断
  const metaRef = useRef<HTMLDivElement>(null);
  const [truncatedPath, setTruncatedPath] = useState(displayPath);
  const [truncatedBranch, setTruncatedBranch] = useState(gitBranch);

  const recalculate = useCallback(() => {
    const el = metaRef.current;
    if (!el) return;
    const totalWidth = el.getBoundingClientRect().width;
    if (totalWidth <= 0) return;

    // 可用总字符空间（扣除 icon 和 gap）
    const itemCount = (displayPath ? 1 : 0) + (gitBranch ? 1 : 0);
    const fixedPx = itemCount * ICON_SPACE_PX + (itemCount - 1) * GAP_PX;
    const availableChars = Math.floor((totalWidth - fixedPx) / CHAR_WIDTH_PX);

    if (displayPath && gitBranch) {
      // 按 6:4 分配，目录名优先
      const pathChars = Math.max(10, Math.floor(availableChars * 0.6));
      const branchChars = Math.max(8, availableChars - pathChars);
      setTruncatedPath(truncatePath(displayPath, pathChars));
      setTruncatedBranch(middleTruncate(gitBranch, branchChars));
    } else if (displayPath) {
      setTruncatedPath(truncatePath(displayPath, Math.max(10, availableChars)));
    } else if (gitBranch) {
      setTruncatedBranch(
        middleTruncate(gitBranch, Math.max(8, availableChars)),
      );
    }
  }, [displayPath, gitBranch]);

  useEffect(() => {
    const el = metaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => recalculate());
    observer.observe(el);
    recalculate();
    return () => observer.disconnect();
  }, [recalculate]);

  // displayPath / gitBranch 变化时同步更新
  useEffect(() => {
    setTruncatedPath(displayPath);
    setTruncatedBranch(gitBranch);
    recalculate();
  }, [displayPath, gitBranch, recalculate]);

  return (
    <div className="flex items-center justify-between gap-2 min-w-0 flex-1 min-h-[40px]">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] leading-[20px] font-medium text-[var(--label-primary)] select-text">
          {title}
        </div>
        {(displayPath || gitBranch) && (
          <div
            ref={metaRef}
            className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] leading-[14px] text-[var(--label-secondary)]"
          >
            {truncatedPath && (
              <CopyableInfo
                key={cwd}
                icon={<Folder size={11} />}
                text={truncatedPath}
                copyText={cwd!}
                title={cwd}
              />
            )}
            {truncatedBranch && (
              <CopyableInfo
                key={gitBranch}
                icon={<GitBranch size={11} />}
                text={truncatedBranch}
                copyText={gitBranch!}
              />
            )}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}
