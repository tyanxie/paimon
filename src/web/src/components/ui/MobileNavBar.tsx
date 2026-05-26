// 移动端导航栏：返回按钮 + 内容区，仅 <md 可见
// 支持两种用法：
//   1. 简写：<MobileNavBar title="设置" />（自动渲染标题/副标题/actions）
//   2. children：<MobileNavBar><InstanceHeader .../></MobileNavBar>（完全自定义内容区）

import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";

interface MobileNavBarProps {
  title?: string;
  subtitle?: string;
  backTo?: string;
  /** 右侧操作区（仅 title 模式生效） */
  actions?: ReactNode;
  /** 自定义内容区，传入后 title/subtitle/actions 被忽略 */
  children?: ReactNode;
}

export function MobileNavBar({
  title,
  subtitle,
  backTo = "/",
  actions,
  children,
}: MobileNavBarProps) {
  const navigate = useNavigate();

  return (
    <div className="md:hidden flex items-center gap-2">
      <button
        onClick={() => navigate(backTo)}
        aria-label="Back to instances"
        className="flex select-none items-center text-[var(--label-secondary)] active:opacity-60 transition-opacity"
      >
        <ChevronLeft size={20} />
      </button>
      {children ?? (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-medium text-[var(--label-primary)] truncate select-text">
              {title}
            </div>
            {subtitle && (
              <div className="text-[11px] text-[var(--label-tertiary)] truncate select-text">
                {subtitle}
              </div>
            )}
          </div>
          {actions}
        </>
      )}
    </div>
  );
}
