// Tool Call 卡片：折叠摘要 + 点击展开弹窗查看详情
// 通过 entries 查找配对的 toolResult

import { useState, useMemo } from "react";
import {
  FileText,
  Terminal,
  Pencil,
  FolderOpen,
  Search,
  Wrench,
  X,
  CircleX,
  Loader2,
} from "lucide-react";
import type { SessionEntry } from "../../../stores/useAppState";

/** 工具图标映射 */
function getToolIcon(name: string) {
  const iconMap: Record<string, React.ReactNode> = {
    read: <FileText size={14} />,
    bash: <Terminal size={14} />,
    edit: <Pencil size={14} />,
    write: <Pencil size={14} />,
    subagent: <FolderOpen size={14} />,
    task: <FolderOpen size={14} />,
    iwiki: <Search size={14} />,
  };
  return iconMap[name] ?? <Wrench size={14} />;
}

/** 从 args 中提取摘要信息 */
function getToolSummary(name: string, args: Record<string, any>): string {
  switch (name) {
    case "read":
      return args.path ?? "";
    case "bash":
      return args.command ? String(args.command).slice(0, 80) : "";
    case "edit":
      return args.path ?? "";
    case "write":
      return args.path ?? "";
    case "subagent":
      return args.task ? String(args.task).slice(0, 60) : "";
    case "task":
      return args.action ?? "";
    default:
      for (const val of Object.values(args)) {
        if (typeof val === "string" && val.length > 0) {
          return val.slice(0, 60);
        }
      }
      return "";
  }
}

/** 从 entries 中查找匹配的 toolResult */
function findToolResult(
  entries: SessionEntry[],
  toolCallId: string,
): { content: string; isError: boolean } | null {
  for (const entry of entries) {
    const msg = entry.message as any;
    if (msg?.role === "toolResult" && msg.toolCallId === toolCallId) {
      const text = Array.isArray(msg.content)
        ? msg.content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n")
        : String(msg.content ?? "");
      return { content: text, isError: msg.isError ?? false };
    }
  }
  return null;
}

export function ToolCallCard({
  name,
  args,
  toolCallId,
  entries,
}: {
  name: string;
  args: Record<string, any>;
  toolCallId?: string;
  entries: SessionEntry[];
}) {
  const [showModal, setShowModal] = useState(false);
  const summary = getToolSummary(name, args);

  // 查找配对的 toolResult
  const result = useMemo(
    () => (toolCallId ? findToolResult(entries, toolCallId) : null),
    [entries, toolCallId],
  );

  const isCompleted = result !== null;
  const isError = result?.isError ?? false;

  return (
    <>
      {/* 折叠卡片 */}
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-[var(--fill-secondary)] border border-[var(--separator)] hover:bg-[var(--fill-tertiary)] transition-colors text-left group"
      >
        <span className="text-[var(--label-secondary)] group-hover:text-[var(--color-accent)] transition-colors">
          {getToolIcon(name)}
        </span>
        <span className="text-[12px] font-medium text-[var(--label-primary)]">
          {name}
        </span>
        {summary && (
          <span className="text-[11px] text-[var(--label-tertiary)] truncate flex-1 min-w-0">
            {summary}
          </span>
        )}
        {/* 状态指示 */}
        {isError && (
          <span className="text-red-400 flex-shrink-0">
            <CircleX size={14} />
          </span>
        )}
        {!isCompleted && (
          <span className="text-[var(--label-tertiary)] flex-shrink-0 animate-spin">
            <Loader2 size={14} />
          </span>
        )}
      </button>

      {/* 详情弹窗 */}
      {showModal && (
        <ToolDetailModal
          name={name}
          args={args}
          result={result}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/** 详情弹窗 */
function ToolDetailModal({
  name,
  args,
  result,
  onClose,
}: {
  name: string;
  args: Record<string, any>;
  result: { content: string; isError: boolean } | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90%] max-w-[640px] max-h-[80vh] rounded-[18px] bg-[var(--panel-bg)] backdrop-blur-[30px] border border-[var(--separator)] shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--separator)]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--label-secondary)]">
              {getToolIcon(name)}
            </span>
            <span className="text-[15px] font-semibold text-[var(--label-primary)]">
              {name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--fill-secondary)] transition-colors text-[var(--label-secondary)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 scrollbar-auto">
          {/* 参数 */}
          <section>
            <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
              参数
            </h4>
            <pre className="text-[12px] leading-[18px] text-[var(--label-secondary)] whitespace-pre-wrap break-words bg-[var(--fill-tertiary)] rounded-[8px] px-3 py-2 overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </section>

          {/* 结果 */}
          {result !== null && (
            <section>
              <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
                结果
              </h4>
              <pre
                className={`text-[12px] leading-[18px] whitespace-pre-wrap break-words rounded-[8px] px-3 py-2 overflow-x-auto ${
                  result.isError
                    ? "text-red-400 bg-red-400/5"
                    : "text-[var(--label-secondary)] bg-[var(--fill-tertiary)]"
                }`}
              >
                {result.content}
              </pre>
            </section>
          )}

          {/* 执行中 */}
          {result === null && (
            <section className="flex items-center gap-2 text-[12px] text-[var(--label-tertiary)]">
              <Loader2 size={14} className="animate-spin" />
              <span>执行中...</span>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
