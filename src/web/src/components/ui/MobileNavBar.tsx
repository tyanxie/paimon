// 移动端导航栏：返回按钮 + 标题/副标题，仅 <md 可见

import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router";

interface MobileNavBarProps {
  title: string;
  subtitle?: string;
  backTo?: string;
}

export function MobileNavBar({
  title,
  subtitle,
  backTo = "/",
}: MobileNavBarProps) {
  const navigate = useNavigate();

  return (
    <div className="md:hidden flex items-center gap-2 -mx-1 -mt-1 mb-3 pb-2 border-b border-[var(--separator)]">
      <button
        onClick={() => navigate(backTo)}
        className="flex items-center text-[var(--label-secondary)] active:opacity-60 transition-opacity"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[var(--label-primary)] truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-[11px] text-[var(--label-tertiary)] truncate">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
