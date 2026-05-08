// 侧边栏：pi 实例列表

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
  return (
    <aside className="w-[240px] h-full flex flex-col border-r border-[var(--separator)] bg-[var(--material-overlay)] backdrop-blur-[30px]">
      {/* 标题区 */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-[var(--label-primary)]">
          Paimon
        </h1>
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
          title={connected ? "Connected to Hub" : "Disconnected"}
        />
      </div>

      {/* 实例列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
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
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors ${
                    selectedId === instance.id
                      ? "bg-[rgba(0,0,0,0.11)] dark:bg-[rgba(255,255,255,0.11)]"
                      : "hover:bg-[var(--fill-tertiary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* 状态指示 */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        instance.status === "streaming"
                          ? "bg-[var(--color-accent)]"
                          : "bg-[var(--label-tertiary)]"
                      }`}
                    />
                    {/* 工作目录（取最后一段） */}
                    <span className="text-[13px] text-[var(--label-primary)] truncate">
                      {instance.cwd.split("/").pop() || instance.cwd}
                    </span>
                  </div>
                  <div className="ml-3.5 text-[11px] text-[var(--label-secondary)] truncate mt-0.5">
                    {instance.model.provider}/{instance.model.id}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部信息 */}
      <div className="px-4 py-2 border-t border-[var(--separator)] text-[10px] text-[var(--label-tertiary)]">
        {instances.length} instance{instances.length !== 1 ? "s" : ""}
      </div>
    </aside>
  );
}
