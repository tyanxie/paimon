// Tool Call 卡片：折叠摘要 + 点击展开弹窗查看详情
// 通过 entries 查找配对的 toolResult

import { useState, useMemo, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import {
  FileText,
  Terminal,
  Pencil,
  Wrench,
  CircleX,
  Loader2,
  ChevronRight,
  Timer,
  CircleHelp,
} from "lucide-react";
import { ResultBlock } from "../ui/ContentBlock";
import { ModalShell } from "../ui/ModalShell";
import type {
  SessionEntry,
  ToolExecutionState,
  ConversationToolState,
} from "../../stores/types";
import { MarkdownRenderer } from "./Markdown";
import { useTranslation } from "react-i18next";

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

/** 构造动态长度的 fenced code block，避免内容中的 ``` 导致解析异常 */
function wrapInFence(content: string, language: string): string {
  // 找到内容中最长的连续 backtick 序列长度
  let maxBackticks = 0;
  const regex = /`+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[0].length > maxBackticks) maxBackticks = match[0].length;
  }
  // 外层 fence 至少比内容中最长的多 1 个，且至少 3 个
  const fence = "`".repeat(Math.max(3, maxBackticks + 1));
  return `${fence}${language}\n${content}\n${fence}`;
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

/** toolResult 结构化结果 */
interface ToolResult {
  /** 纯文本内容（已从 content blocks 提取） */
  content: string;
  isError: boolean;
  durationMs?: number;
  /** 工具特定元数据（如 edit 的 diff） */
  details?: Record<string, any>;
}

/** 提取工具结果中的文本和元数据 */
function normalizeToolResult(
  value: unknown,
  isError = false,
  durationMs?: number,
): ToolResult {
  const result = value as {
    content?: unknown;
    details?: Record<string, any>;
  } | null;
  const content = result?.content;
  return {
    content: Array.isArray(content)
      ? content
          .filter((block) => block?.type === "text")
          .map((block) => block.text)
          .join("\n")
      : String(content ?? ""),
    details: result?.details,
    isError,
    durationMs,
  };
}

/** 从 entries 中查找匹配的 toolResult */
function findToolResult(
  entries: SessionEntry[],
  toolCallId: string,
): ToolResult | null {
  for (const entry of entries) {
    const msg = entry.message as any;
    if (msg?.role === "toolResult" && msg.toolCallId === toolCallId) {
      return normalizeToolResult(msg, msg.isError ?? false, msg.durationMs);
    }
  }
  return null;
}

export function ToolCallCard({
  name,
  args,
  toolCallId,
  entries,
  execution,
  isAborted = false,
  state,
  compact = false,
}: {
  name: string;
  args: Record<string, any>;
  toolCallId?: string;
  entries: SessionEntry[];
  execution?: ToolExecutionState;
  isAborted?: boolean;
  state?: ConversationToolState;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const summary = getToolSummary(name, args);

  // 查找配对的 toolResult
  const historyResult = useMemo(
    () => (toolCallId ? findToolResult(entries, toolCallId) : null),
    [entries, toolCallId],
  );
  const finalResult =
    historyResult ??
    (state?.status === "completed" || state?.status === "error"
      ? normalizeToolResult(
          state.result,
          state.status === "error",
          state.durationMs,
        )
      : null) ??
    (execution?.status === "completed"
      ? normalizeToolResult(
          execution.result,
          execution.isError,
          execution.durationMs,
        )
      : null);
  const result =
    finalResult ??
    (execution?.status === "running" && execution.partialResult != null
      ? normalizeToolResult(execution.partialResult)
      : null);
  const isCompleted = finalResult !== null;
  const terminated = isAborted || state?.status === "aborted";
  const isUnknown = !isCompleted && state?.status === "unknown";
  const isRunning = !isCompleted && !terminated && !isUnknown;
  const isError = finalResult?.isError ?? false;
  const isFailed = isError || (!isCompleted && terminated);
  const elapsed = useToolElapsed(isRunning ? execution?.startedAt : undefined);
  const durationDisplay = (
    <ToolDuration
      elapsed={finalResult?.durationMs ?? elapsed}
      isFinal={isCompleted}
    />
  );

  // 按工具名选择弹窗组件
  const DetailModal =
    name === "read"
      ? ReadDetailModal
      : name === "bash"
        ? BashDetailModal
        : name === "write"
          ? WriteDetailModal
          : name === "edit"
            ? EditDetailModal
            : DefaultDetailModal;

  return (
    <>
      {/* 折叠卡片 */}
      <button
        type="button"
        aria-label={t("conversation.toolDetails", { name })}
        data-tool-state={
          isRunning
            ? "running"
            : isUnknown
              ? "unknown"
              : terminated && !isCompleted
                ? "aborted"
                : isError
                  ? "error"
                  : "completed"
        }
        onClick={() => setShowModal(true)}
        className={
          compact
            ? "conversation-tool-row flex w-full items-center gap-2 rounded-control px-3 py-1 text-left group select-none hover:bg-[var(--fill-quaternary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            : "w-full max-w-[640px] flex items-center gap-2.5 px-3 py-2 rounded-content bg-[var(--fill-card)] border border-[var(--separator)] hover:bg-[var(--fill-tertiary)] transition-colors text-left group select-none"
        }
      >
        <span className="text-[var(--label-secondary)] group-hover:text-[var(--color-accent)] transition-colors">
          {getToolIcon(name)}
        </span>
        <span className="text-[13px] font-medium text-[var(--label-primary)]">
          {name}
        </span>
        {summary && (
          <span className="text-[12px] text-[var(--label-tertiary)] truncate flex-1 min-w-0">
            {summary}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2.5 flex-shrink-0">
          {compact && (
            <span className="hidden text-[11px] text-[var(--label-secondary)] sm:inline">
              {t(
                isRunning
                  ? "entries.running"
                  : isUnknown
                    ? "conversation.toolUnknown"
                    : terminated && !isCompleted
                      ? "entries.aborted"
                      : isError
                        ? "conversation.toolFailed"
                        : "conversation.toolCompleted",
              )}
            </span>
          )}
          {durationDisplay}
          {/* 右侧状态 icon：执行中 / 失败 / 完成 */}
          <span className="flex-shrink-0">
            {isRunning ? (
              <Loader2
                size={14}
                className="text-[var(--label-tertiary)] animate-spin motion-reduce:animate-none"
              />
            ) : isUnknown ? (
              <CircleHelp size={14} className="text-[var(--label-secondary)]" />
            ) : isFailed ? (
              <CircleX size={14} className="text-red-400" />
            ) : (
              <ChevronRight
                size={14}
                className="text-[var(--label-tertiary)] group-hover:text-[var(--label-secondary)] transition-colors"
              />
            )}
          </span>
        </span>
      </button>

      {/* 详情弹窗 */}
      <AnimatePresence>
        {showModal && (
          <DetailModal
            key={toolCallId ?? name}
            name={name}
            args={args}
            result={result}
            durationDisplay={durationDisplay}
            isRunning={isRunning}
            isAborted={terminated}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ========================================
   Detail Modals
   ======================================== */

interface DetailModalProps {
  name: string;
  args: Record<string, any>;
  result: ToolResult | null;
  durationDisplay: React.ReactNode;
  isRunning: boolean;
  isAborted: boolean;
  onClose: () => void;
}

/** 同一工具调用共享运行计时 */
function useToolElapsed(startedAt?: number): number | undefined {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === undefined) return;
    const update = () => setElapsed(Math.max(0, performance.now() - startedAt));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === undefined ? undefined : elapsed;
}

/** 工具调用等待时间和最终执行耗时 */
function ToolDuration({
  elapsed,
  isFinal,
}: {
  elapsed?: number;
  isFinal: boolean;
}) {
  const { t } = useTranslation();
  if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed <= 0)
    return null;
  return (
    <span
      title={t(
        isFinal ? "entries.executionDuration" : "entries.waitingDuration",
      )}
      className="flex items-center gap-1 text-[11px] text-[var(--label-tertiary)] flex-shrink-0"
    >
      <Timer size={12} />
      {elapsed < 1000
        ? `${Math.max(1, Math.round(elapsed))}\u00a0ms`
        : `${(elapsed / 1000).toFixed(1)}\u00a0s`}
    </span>
  );
}

/** 执行中指示器 */
function RunningIndicator() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-[12px] text-[var(--label-tertiary)]">
      <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
      <span>{t("entries.running")}</span>
    </div>
  );
}

/** 已终止指示器 */
function AbortedIndicator() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-[12px] text-red-400">
      <CircleX size={14} />
      <span>{t("entries.aborted")}</span>
    </div>
  );
}

/** 缺少结果时展示已有的运行状态。 */
function ToolPendingIndicator({
  isRunning,
  isAborted,
}: {
  isRunning: boolean;
  isAborted: boolean;
}) {
  const { t } = useTranslation();
  if (isAborted) return <AbortedIndicator />;
  if (isRunning) return <RunningIndicator />;
  return (
    <p className="text-[12px] text-[var(--label-secondary)]">
      {t("conversation.toolUnknown")}
    </p>
  );
}

/** 工具弹窗标题（icon + name） */
function ToolModalTitle({
  name,
  isRunning = false,
}: {
  name: string;
  isRunning?: boolean;
}) {
  return (
    <>
      <span className="text-[var(--label-secondary)] select-none">
        {getToolIcon(name)}
      </span>
      {name}
      {isRunning && <RunningIndicator />}
    </>
  );
}

/** Read 工具专用弹窗 */
function ReadDetailModal({
  name,
  args,
  result,
  durationDisplay,
  isRunning,
  isAborted,
  onClose,
}: DetailModalProps) {
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

  // markdown 文件直接渲染，其他文件用代码块
  const isMarkdown = language === "markdown";
  const codeBlock =
    result && !result.isError && !isMarkdown
      ? wrapInFence(result.content, language ?? "")
      : null;

  return (
    <ModalShell
      title={
        <ToolModalTitle name={name} isRunning={isRunning && result !== null} />
      }
      onClose={onClose}
      trailing={durationDisplay}
    >
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[13px] text-[var(--label-secondary)] break-all leading-[20px] font-mono">
          {addressText}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 scrollbar-auto">
        {result !== null ? (
          result.isError ? (
            <ResultBlock error>{result.content}</ResultBlock>
          ) : isMarkdown ? (
            <MarkdownRenderer content={result.content} />
          ) : (
            <MarkdownRenderer content={codeBlock!} />
          )
        ) : (
          <ToolPendingIndicator isRunning={isRunning} isAborted={isAborted} />
        )}
      </div>
    </ModalShell>
  );
}

/** Bash 工具专用弹窗 */
function BashDetailModal({
  name,
  args,
  result,
  durationDisplay,
  isRunning,
  isAborted,
  onClose,
}: DetailModalProps) {
  const { t } = useTranslation();
  const command = args.command ?? "";
  const timeout = args.timeout as number | undefined;

  // command 用 bash 代码块渲染
  const commandBlock = wrapInFence(command, "bash");
  // result 用 plaintext 代码块渲染
  const resultBlock =
    result && !result.isError
      ? wrapInFence(result.content.trim(), "plaintext")
      : null;

  return (
    <ModalShell
      title={
        <ToolModalTitle name={name} isRunning={isRunning && result !== null} />
      }
      onClose={onClose}
      trailing={durationDisplay}
    >
      {/* 内容区：命令 + 结果单一滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-auto">
        {/* 命令块 */}
        <div className="px-5 pt-3 pb-3 bg-[var(--fill-quaternary)]">
          {timeout != null && (
            <p className="mb-2 text-[11px] text-[var(--label-tertiary)]">
              {t("entries.timeout")}
              {": "}
              <span className="whitespace-nowrap">{`${timeout}\u00a0s`}</span>
            </p>
          )}
          <MarkdownRenderer content={commandBlock} />
        </div>

        {/* 结果块 */}
        <div className="px-5 pt-3 pb-5">
          <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-2">
            {t("entries.output")}
          </h4>
          {result !== null ? (
            result.isError ? (
              <ResultBlock error>{result.content}</ResultBlock>
            ) : (
              <MarkdownRenderer content={resultBlock!} />
            )
          ) : (
            <ToolPendingIndicator isRunning={isRunning} isAborted={isAborted} />
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/** Write 工具专用弹窗 */
function WriteDetailModal({
  name,
  args,
  result,
  durationDisplay,
  isRunning,
  isAborted,
  onClose,
}: DetailModalProps) {
  const { t } = useTranslation();
  const path = args.path ?? "";
  const content = args.content ?? "";
  const language = getLanguageFromPath(path);

  // markdown 文件直接渲染，其他文件用代码块
  const isMarkdown = language === "markdown";
  const contentBlock = isMarkdown ? null : wrapInFence(content, language ?? "");

  return (
    <ModalShell
      trailing={durationDisplay}
      title={
        <ToolModalTitle name={name} isRunning={isRunning && result !== null} />
      }
      onClose={onClose}
    >
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[13px] text-[var(--label-secondary)] break-all leading-[20px] font-mono">
          {path}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-3 scrollbar-auto">
        {/* 文件内容 */}
        <section>
          <MarkdownRenderer content={isMarkdown ? content : contentBlock!} />
        </section>

        {/* 结果 */}
        {result !== null && (
          <section>
            <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
              {t("entries.result")}
            </h4>
            <ResultBlock error={result.isError}>{result.content}</ResultBlock>
          </section>
        )}

        {result === null && (
          <ToolPendingIndicator isRunning={isRunning} isAborted={isAborted} />
        )}
      </div>
    </ModalShell>
  );
}

/** Diff 行解析渲染 */
function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="text-[13px] leading-[20px] font-mono overflow-x-auto">
      <div style={{ minWidth: "fit-content" }}>
        {lines.map((line, i) => {
          const prefix = line[0];
          if (prefix === "+") {
            return (
              <div
                key={i}
                className="px-3 rounded-inline"
                style={{
                  backgroundColor: "var(--diff-add-bg)",
                  color: "var(--diff-add-text)",
                }}
              >
                {line}
              </div>
            );
          }
          if (prefix === "-") {
            return (
              <div
                key={i}
                className="px-3 rounded-inline"
                style={{
                  backgroundColor: "var(--diff-del-bg)",
                  color: "var(--diff-del-text)",
                }}
              >
                {line}
              </div>
            );
          }
          // 上下文行（空格前缀）
          return (
            <div
              key={i}
              className="px-3"
              style={{ color: "var(--diff-context-text)" }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </pre>
  );
}

/** Edit 工具专用弹窗 */
function EditDetailModal({
  name,
  args,
  result,
  durationDisplay,
  isRunning,
  isAborted,
  onClose,
}: DetailModalProps) {
  const path = args.path ?? "";
  const diff = result?.details?.diff as string | undefined;

  return (
    <ModalShell
      trailing={durationDisplay}
      title={
        <ToolModalTitle name={name} isRunning={isRunning && result !== null} />
      }
      onClose={onClose}
    >
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[13px] text-[var(--label-secondary)] break-all leading-[20px] font-mono">
          {path}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto pt-3 pb-5 scrollbar-auto">
        {result !== null ? (
          result.isError ? (
            <ResultBlock error className="mx-5">
              {result.content}
            </ResultBlock>
          ) : diff ? (
            <DiffView diff={diff} />
          ) : (
            // fallback: 无 diff 数据时显示纯文本结果
            <ResultBlock className="mx-5">{result.content}</ResultBlock>
          )
        ) : (
          <div className="px-5">
            <ToolPendingIndicator isRunning={isRunning} isAborted={isAborted} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/** 默认通用弹窗（JSON args + 纯文本 result） */
function DefaultDetailModal({
  name,
  args,
  result,
  durationDisplay,
  isRunning,
  isAborted,
  onClose,
}: DetailModalProps) {
  const { t } = useTranslation();
  return (
    <ModalShell
      title={
        <ToolModalTitle name={name} isRunning={isRunning && result !== null} />
      }
      onClose={onClose}
      trailing={durationDisplay}
    >
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-3 scrollbar-auto">
        {/* 参数 */}
        <section>
          <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
            {t("entries.params")}
          </h4>
          <ResultBlock>{JSON.stringify(args, null, 2)}</ResultBlock>
        </section>

        {/* 结果 */}
        {result !== null && (
          <section>
            <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
              {t("entries.result")}
            </h4>
            <ResultBlock error={result.isError}>{result.content}</ResultBlock>
          </section>
        )}

        {result === null && (
          <section>
            <ToolPendingIndicator isRunning={isRunning} isAborted={isAborted} />
          </section>
        )}
      </div>
    </ModalShell>
  );
}
