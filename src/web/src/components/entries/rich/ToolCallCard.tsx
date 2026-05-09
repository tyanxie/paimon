// Tool Call 卡片：折叠摘要 + 点击展开弹窗查看详情
// 通过 entries 查找配对的 toolResult

import { useState, useMemo } from "react";
import {
  FileText,
  Terminal,
  Pencil,
  Wrench,
  X,
  CircleX,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { SessionEntry } from "../../../stores/useAppState";
import { MarkdownRenderer } from "./Markdown";

/** 工具图标映射 */
function getToolIcon(name: string) {
  const iconMap: Record<string, React.ReactNode> = {
    read: <FileText size={14} />,
    bash: <Terminal size={14} />,
    edit: <Pencil size={14} />,
    write: <Pencil size={14} />,
  };
  return iconMap[name] ?? <Wrench size={14} />;
}

/** 从 args 中提取摘要信息 */
function getToolSummary(name: string, args: Record<string, any>): string {
  switch (name) {
    case "read": {
      const path = args.path ?? "";
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      if (offset != null || limit != null) {
        const start = offset ?? "";
        const end = limit != null ? (offset ?? 1) + limit - 1 : "";
        return `${path} [${start}:${end}]`;
      }
      return path;
    }
    case "bash":
      return args.command ? String(args.command).slice(0, 80) : "";
    case "edit":
      return args.path ?? "";
    case "write":
      return args.path ?? "";
    default:
      return "";
  }
}

/** 文件扩展名到 highlight.js 语言的映射 */
const extToLanguage: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  mdx: "markdown",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  lua: "lua",
  vim: "vim",
  diff: "diff",
  patch: "diff",
};

/** 从文件路径提取语言 */
function getLanguageFromPath(path: string): string | undefined {
  const filename = path.split("/").pop() ?? "";
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile" || lower === "gnumakefile") return "makefile";
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return extToLanguage[ext];
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

  // 按工具名选择弹窗组件
  const DetailModal = name === "read" ? ReadDetailModal : DefaultDetailModal;

  return (
    <>
      {/* 折叠卡片 */}
      <button
        onClick={() => setShowModal(true)}
        className="w-full max-w-[640px] flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-[var(--fill-secondary)] border border-[var(--separator)] hover:bg-[var(--fill-tertiary)] transition-colors text-left group"
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
        {/* 右侧状态 icon：执行中 / 失败 / 完成 */}
        <span className="flex-shrink-0 ml-auto">
          {!isCompleted ? (
            <Loader2
              size={14}
              className="text-[var(--label-tertiary)] animate-spin"
            />
          ) : isError ? (
            <CircleX size={14} className="text-red-400" />
          ) : (
            <ChevronRight
              size={14}
              className="text-[var(--label-tertiary)] group-hover:text-[var(--label-secondary)] transition-colors"
            />
          )}
        </span>
      </button>

      {/* 详情弹窗 */}
      {showModal && (
        <DetailModal
          name={name}
          args={args}
          result={result}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/* ========================================
   Detail Modals
   ======================================== */

interface DetailModalProps {
  name: string;
  args: Record<string, any>;
  result: { content: string; isError: boolean } | null;
  onClose: () => void;
}

/** 弹窗外壳（共用布局） */
function ModalShell({
  name,
  onClose,
  children,
}: {
  name: string;
  onClose: () => void;
  children: React.ReactNode;
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

        {/* 内容区 */}
        {children}
      </div>
    </div>
  );
}

/** Read 工具专用弹窗 */
function ReadDetailModal({ name, args, result, onClose }: DetailModalProps) {
  const path = args.path ?? "";
  const offset = args.offset as number | undefined;
  const limit = args.limit as number | undefined;
  const language = getLanguageFromPath(path);

  // 构造地址栏文本
  let addressText = path;
  if (offset != null || limit != null) {
    const start = offset ?? "";
    const end = limit != null ? (offset ?? 1) + limit - 1 : "";
    addressText += ` [${start}:${end}]`;
  }

  // 构造 markdown 代码块
  const codeBlock =
    result && !result.isError
      ? `\`\`\`${language ?? ""}\n${result.content}\n\`\`\``
      : null;

  return (
    <ModalShell name={name} onClose={onClose}>
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[12px] text-[var(--label-secondary)] break-all leading-[18px] font-mono">
          {addressText}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 scrollbar-auto">
        {result !== null ? (
          result.isError ? (
            <pre className="text-[12px] leading-[18px] whitespace-pre-wrap break-words rounded-[8px] px-3 py-2 text-red-400 bg-red-400/5">
              {result.content}
            </pre>
          ) : (
            <MarkdownRenderer content={codeBlock!} />
          )
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-[var(--label-tertiary)]">
            <Loader2 size={14} className="animate-spin" />
            <span>执行中...</span>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/** 默认通用弹窗（JSON args + 纯文本 result） */
function DefaultDetailModal({ name, args, result, onClose }: DetailModalProps) {
  return (
    <ModalShell name={name} onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-3 scrollbar-auto">
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
    </ModalShell>
  );
}
