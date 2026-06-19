// Thinking 区块：streaming 时展开，输出开始后自动折叠

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "./Markdown";

export function ThinkingBlock({
  content,
  streaming,
  autoCollapse,
}: {
  content: string;
  streaming: boolean;
  autoCollapse: boolean;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(autoCollapse);
  const hasAutoCollapsed = useRef(false);

  // 自动折叠：当 autoCollapse 变为 true 时折叠一次
  useEffect(() => {
    if (autoCollapse && !hasAutoCollapsed.current) {
      hasAutoCollapsed.current = true;
      setCollapsed(true);
    }
  }, [autoCollapse]);

  return (
    <div
      className={`rounded-[8px] bg-[var(--fill-card)] border border-[var(--separator)] overflow-hidden transition-all ${collapsed ? "max-w-[640px]" : ""}`}
    >
      {/* 标题栏：可点击切换折叠 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-[var(--fill-quaternary)] transition-colors"
      >
        <ChevronRight
          size={12}
          className={`text-[var(--label-tertiary)] transition-transform ${
            collapsed ? "" : "rotate-90"
          }`}
        />
        <span className="text-[12px] font-medium text-[var(--label-tertiary)]">
          {streaming ? t("entries.thinkingStreaming") : t("entries.thinking")}
        </span>
      </button>

      {/* 内容区域 */}
      {!collapsed && (
        <div className="px-3 pb-2.5 pt-0.5 text-[var(--label-secondary)] italic">
          <MarkdownRenderer content={content} />
        </div>
      )}
    </div>
  );
}
