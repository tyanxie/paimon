// 实例顶栏内容：标题 + git 分支 + 右侧操作区（纯内容组件，不感知布局上下文）

import { type ReactNode } from "react";
import { GitBranch } from "lucide-react";

interface InstanceHeaderProps {
  title: string;
  gitBranch?: string | null;
  /** 右侧操作区 */
  actions?: ReactNode;
}

export function InstanceHeader({
  title,
  gitBranch,
  actions,
}: InstanceHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0 flex-1">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] leading-[20px] font-medium text-[var(--label-primary)] select-text">
          {title}
        </div>
        {gitBranch && (
          <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-[var(--label-tertiary)]">
            <GitBranch size={11} className="shrink-0 opacity-70 select-none" />
            <span className="truncate select-text">{gitBranch}</span>
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}
