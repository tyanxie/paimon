// 移动端导航栏：返回按钮 + 内容区，仅 <md 可见
// 支持两种用法：
//   1. 简写：<MobileNavBar title="设置" />（自动渲染标题/副标题/actions）
//   2. children：<MobileNavBar><InstanceHeader .../></MobileNavBar>（完全自定义内容区）

import { type ReactNode } from "react";
import { Button } from "./Button";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <div className="md:hidden flex items-center gap-2">
      <Button
        size="icon"
        type="button"
        onClick={() => navigate(backTo)}
        aria-label={t("navigation.backToInstances")}
        className="flex shrink-0 select-none items-center justify-center rounded-full bg-[var(--material-thin)] text-[var(--label-secondary)] active:opacity-60 transition-opacity focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <ChevronLeft size={20} />
      </Button>
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
