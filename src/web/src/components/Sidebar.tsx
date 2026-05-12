// 侧边栏：pi 实例列表（独立玻璃面板）

import { Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router";
import type { InstanceInfo, InstanceId } from "../../../protocol/types";

interface SidebarProps {
  instances: InstanceInfo[];
  selectedId: InstanceId | null;
  onSelect: (id: InstanceId) => void;
  connected: boolean;
}

export function Sidebar({
  instances,
  selectedId,
  onSelect,
  connected,
}: SidebarProps) {
  const navigate = useNavigate();

  return (
    <aside className="glass-panel w-[240px] md:w-[240px] flex-shrink-0 flex flex-col overflow-hidden max-md:w-full max-md:flex-1">
      {/* 标题区 */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-x-2.5 items-center">
          <div className="row-span-2">
            <img
              src="/paimon-logo.png"
              alt="Paimon"
              className="h-[34px] w-auto object-contain"
            />
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-[15px] font-semibold text-[var(--label-primary)] leading-tight">
              Paimon
            </h1>
            <span
              className={`w-2 h-2 rounded-full transition-colors ${connected ? "bg-green-500" : "bg-red-500"}`}
              title={connected ? "Online" : "Offline"}
            />
          </div>
          <div className="text-[11px] text-[var(--label-tertiary)] leading-tight">
            {instances.length} instance{instances.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* 实例列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-auto">
        {instances.length === 0 ? (
          <div className="px-3 py-8 text-center text-[var(--label-tertiary)] text-[11px]">
            No pi instances connected
          </div>
        ) : (
          <ul className="space-y-1">
            {instances.map((instance) => (
              <li key={instance.id}>
                <button
                  onClick={() => onSelect(instance.id)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-[8px] transition-all duration-150 ${
                    selectedId === instance.id
                      ? "bg-[rgba(0,0,0,0.11)] dark:bg-[rgba(255,255,255,0.11)]"
                      : "hover:bg-[var(--fill-tertiary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* 状态指示 */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                        instance.status === "streaming"
                          ? "bg-[var(--color-accent)]"
                          : "bg-green-500"
                      }`}
                      title={
                        instance.status === "streaming" ? "Streaming" : "Idle"
                      }
                    />
                    {/* 工作目录（取最后一段） */}
                    <span className="text-[13px] text-[var(--label-primary)] truncate">
                      {instance.cwd.split("/").pop() || instance.cwd}
                    </span>
                  </div>
                  <div className="ml-3.5 text-[11px] text-[var(--label-secondary)] truncate mt-0.5">
                    {instance.model.name ||
                      `${instance.model.provider}/${instance.model.id}`}
                  </div>
                  {/* 上下文使用率进度条 */}
                  {instance.contextUsage?.percent != null &&
                    instance.contextUsage.percent > 0 && (
                      <div className="ml-3.5 mt-1.5 h-[3px] rounded-full bg-[var(--fill-quaternary)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(2, Math.min(100, instance.contextUsage.percent))}%`,
                            backgroundColor:
                              instance.contextUsage.percent >= 90
                                ? "#ff4245"
                                : instance.contextUsage.percent >= 60
                                  ? "#ff9230"
                                  : "#30d158",
                          }}
                        />
                      </div>
                    )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 设置入口 */}
      <div className="px-3 py-2 border-t border-[var(--separator)]">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-[8px] text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-all duration-150"
        >
          <SettingsIcon size={14} />
          <span className="text-[12px]">设置</span>
        </button>
      </div>
    </aside>
  );
}
