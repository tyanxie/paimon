// 会话信息条：展示 git 分支 + 上下文使用情况
// 独立组件，可灵活放置在对话区顶部/底部

import { GitBranch } from "lucide-react";
import type { ContextUsageInfo } from "../../../protocol/types";

interface SessionInfoBarProps {
  gitBranch?: string | null;
  contextUsage?: ContextUsageInfo;
}

/** 格式化 token 数量 */
function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

export function SessionInfoBar({
  gitBranch,
  contextUsage,
}: SessionInfoBarProps) {
  const hasGitBranch = gitBranch && gitBranch !== "null";
  const hasContext = contextUsage?.percent != null;

  // 两侧都无数据时不渲染
  if (!hasGitBranch && !hasContext) return null;

  const percentColor =
    contextUsage && contextUsage.percent != null
      ? contextUsage.percent >= 90
        ? "#ff4245"
        : contextUsage.percent >= 60
          ? "#ff9230"
          : "#30d158"
      : undefined;

  return (
    <div className="flex items-center justify-between px-5 py-2 border-b border-[var(--separator)] text-[12px] text-[var(--label-secondary)]">
      {/* 左侧：git 分支 */}
      <div className="flex items-center gap-1.5">
        {hasGitBranch && (
          <>
            <GitBranch size={12} />
            <span>{gitBranch}</span>
          </>
        )}
      </div>

      {/* 右侧：上下文使用 */}
      <div className="flex items-center gap-1.5">
        {hasContext && contextUsage && (
          <>
            <span>
              {contextUsage.tokens != null
                ? formatTokens(contextUsage.tokens)
                : "—"}{" "}
              / {formatTokens(contextUsage.contextWindow)}
            </span>
            <span style={{ color: percentColor }}>
              {Math.round(contextUsage.percent!)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}
