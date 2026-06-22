// 侧边栏：pi 实例列表（独立玻璃面板）

import { useState, useRef, useCallback } from "react";
import { Settings as SettingsIcon, LogOut, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import type { InstanceInfo, InstanceId } from "../../../protocol/types";
import { useLogoSrc } from "../hooks/useLogoSrc";
import {
  ContextMenu,
  ContextMenuItem,
  type ContextMenuPosition,
} from "./ui/ContextMenu";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  instances: InstanceInfo[];
  selectedId: InstanceId | null;
  onSelect: (id: InstanceId) => void;
  onShutdown: (id: InstanceId) => void;
  onNewInstance: () => void;
  connected: boolean;
}

/** 长按触发阈值 (ms) */
const LONG_PRESS_DELAY = 500;

export function Sidebar({
  instances,
  selectedId,
  onSelect,
  onShutdown,
  onNewInstance,
  connected,
}: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logoSrc = useLogoSrc();

  // 右键/长按菜单状态
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    instanceId: InstanceId;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 标记当前触摸是否已触发长按（防止 touchEnd 时触发 click）
  const longPressFiredRef = useRef(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, instanceId: InstanceId) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ position: { x: e.clientX, y: e.clientY }, instanceId });
    },
    [],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, instanceId: InstanceId) => {
      longPressFiredRef.current = false;
      const touch = e.touches[0];
      const pos = { x: touch.clientX, y: touch.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        navigator.vibrate?.(10);
        setContextMenu({ position: pos, instanceId });
      }, LONG_PRESS_DELAY);
    },
    [],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    // 手指移动取消长按
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  return (
    <aside className="glass-panel select-none w-[240px] md:w-[240px] flex-shrink-0 flex flex-col overflow-hidden max-md:w-full max-md:flex-1">
      {/* 标题区 */}
      <div className="px-4 pt-4 pb-2">
        <div className="grid grid-cols-[auto_1fr] grid-rows-[auto_auto] gap-x-2.5 items-center">
          <div className="row-span-2">
            <img
              src={logoSrc}
              alt="Paimon"
              className="h-[34px] aspect-square object-contain"
            />
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-[16px] leading-[20px] max-md:text-[18px] max-md:leading-[24px] font-semibold text-[var(--label-primary)]">
              Paimon
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={onNewInstance}
                title={t("sidebar.newInstance")}
                className="select-none w-6 h-6 flex items-center justify-center rounded-full text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-all duration-150"
              >
                <Plus size={16} />
              </button>
              <span
                className={`w-2 h-2 rounded-full transition-colors ${connected ? "bg-green-500" : "bg-red-500"}`}
                title={connected ? t("common.online") : t("common.offline")}
              />
            </div>
          </div>
          <div className="text-[12px] leading-[15px] max-md:text-[13px] max-md:leading-[18px] text-[var(--label-tertiary)]">
            {t("sidebar.instanceCount", { count: instances.length })}
          </div>
        </div>
      </div>

      {/* 实例列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-auto">
        {instances.length === 0 ? (
          <div className="px-3 py-8 text-center text-[var(--label-tertiary)] text-[12px] leading-[16px] max-md:text-[13px] max-md:leading-[18px]">
            {t("sidebar.noInstances")}
          </div>
        ) : (
          <ul className="space-y-0.5 max-md:space-y-1">
            {instances.map((instance) => (
              <li key={instance.id}>
                <button
                  onClick={() => {
                    // 长按触发后不响应 click
                    if (longPressFiredRef.current) return;
                    onSelect(instance.id);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, instance.id)}
                  onTouchStart={(e) => handleTouchStart(e, instance.id)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchMove}
                  className={`w-full text-left px-2.5 py-1.5 max-md:px-3 max-md:py-2.5 rounded-[8px] transition-all duration-150 ${
                    selectedId === instance.id
                      ? "bg-[rgba(0,145,255,0.08)] dark:bg-[rgba(0,145,255,0.12)]"
                      : "hover:bg-[var(--fill-tertiary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* 状态指示 */}
                    <span
                      className={`w-1.5 h-1.5 max-md:w-2 max-md:h-2 rounded-full flex-shrink-0 transition-colors ${
                        instance.status === "streaming"
                          ? "bg-[var(--color-accent)] animate-pulse"
                          : instance.status === "compacting"
                            ? "bg-amber-500 animate-pulse"
                            : "bg-green-500"
                      }`}
                      title={
                        instance.status === "streaming"
                          ? t("sidebar.statusStreaming")
                          : instance.status === "compacting"
                            ? t("sidebar.statusCompacting")
                            : t("sidebar.statusIdle")
                      }
                    />
                    {/* 工作目录（取最后一段） */}
                    <span className="text-[14px] leading-[18px] max-md:text-[15px] max-md:leading-[21px] text-[var(--label-primary)] truncate">
                      {instance.cwd.split("/").pop() || instance.cwd}
                    </span>
                  </div>
                  <div className="ml-3.5 text-[11px] leading-[14px] max-md:text-[12px] max-md:leading-[16px] text-[var(--label-secondary)] truncate mt-0.5">
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

      {/* 右键/长按上下文菜单 */}
      {contextMenu && (
        <ContextMenu position={contextMenu.position} onClose={closeContextMenu}>
          <ContextMenuItem
            icon={<LogOut size={14} />}
            label={t("sidebar.shutdown")}
            danger
            onClick={() => {
              onShutdown(contextMenu.instanceId);
              closeContextMenu();
            }}
          />
        </ContextMenu>
      )}

      {/* 设置入口 */}
      <div className="px-3 py-2 border-t border-[var(--separator)]">
        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 w-full px-2.5 py-1.5 max-md:py-2.5 rounded-[8px] text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-all duration-150"
        >
          <SettingsIcon size={15} className="max-md:w-4 max-md:h-4" />
          <span className="text-[13px] leading-[18px] max-md:text-[14px] max-md:leading-[20px]">
            {t("sidebar.settings")}
          </span>
        </button>
      </div>
    </aside>
  );
}
