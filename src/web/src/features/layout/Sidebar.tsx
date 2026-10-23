// 整体玻璃侧栏：全局入口与按 Edge 分组的实例列表

import { AnimatePresence } from "motion/react";
import { Button } from "../../components/ui/Button";
import {
  useMemo,
  useState,
  useRef,
  useCallback,
  useEffect,
  useId,
} from "react";
import {
  Settings as SettingsIcon,
  ChevronRight,
  LogOut,
  Plus,
  Check,
  Copy,
  Server,
  MoreHorizontal,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import type { InstanceInfo, InstanceId } from "@protocol/types";
import {
  getInstanceStatusDotClass,
  getInstanceStatusKey,
} from "../../utils/status";
import { useLogoSrc } from "../../hooks/useLogoSrc";
import { useSidebar } from "../../stores/useSidebar";
import { useWebSocket } from "../../stores/useWebSocket";
import { Popover } from "../../components/ui/Popover";
import { MenuItem } from "../../components/ui/MenuItem";
import {
  ContextMenu,
  ContextMenuItem,
  type ContextMenuPosition,
} from "../../components/ui/ContextMenu";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  instances: InstanceInfo[];
  selectedId: InstanceId | null;
  onSelect: (id: InstanceId) => void;
  onShutdown: (id: InstanceId) => void;
  onNewInstance: () => void;
}

const LONG_PRESS_DELAY = 500;

export function Sidebar({
  instances,
  selectedId,
  onSelect,
  onShutdown,
  onNewInstance,
}: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const logoSrc = useLogoSrc();
  const sidebarId = useId();
  const collapsedEdges = useSidebar((s) => s.collapsedEdges);
  const toggleEdge = useSidebar((s) => s.toggleEdge);
  const connectionState = useWebSocket((s) => s.connectionState);
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition;
    instanceId: InstanceId;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const [copiedEdgeId, setCopiedEdgeId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelLongPress();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [cancelLongPress],
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent, instanceId: InstanceId) => {
      cancelLongPress();
      longPressFiredRef.current = false;
      const touch = event.touches[0];
      if (!touch) return;
      const position = { x: touch.clientX, y: touch.clientY };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressFiredRef.current = true;
        navigator.vibrate?.(10);
        setContextMenu({ position, instanceId });
      }, LONG_PRESS_DELAY);
    },
    [cancelLongPress],
  );

  const handleCopyEdgeId = useCallback((edgeId: string) => {
    navigator.clipboard.writeText(edgeId).then(
      () => {
        setCopiedEdgeId(edgeId);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedEdgeId(null), 1500);
      },
      () => {},
    );
  }, []);

  const edgeGroups = useMemo(() => {
    const groups = new Map<string, InstanceInfo[]>();
    for (const instance of instances) {
      const group = groups.get(instance.edgeId);
      if (group) group.push(instance);
      else groups.set(instance.edgeId, [instance]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [instances]);

  return (
    <aside className="sidebar-layout select-none glass-panel flex min-h-0 w-full flex-1 flex-col overflow-hidden md:w-[240px] md:flex-none lg:w-[260px]">
      <header className="sidebar-header flex min-h-[60px] shrink-0 items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => navigate("/")}
          title={t("navigation.home")}
          aria-label={t("navigation.home")}
          aria-current={pathname === "/" ? "page" : undefined}
          className="sidebar-brand flex min-w-0 flex-1 items-center gap-2 rounded-control text-left"
        >
          <img
            src={logoSrc}
            alt=""
            className="h-[34px] w-[34px] shrink-0 object-contain"
          />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold leading-[20px] text-[var(--label-primary)]">
              {t("navigation.brand")}
            </span>
            <span className="block text-[10px] leading-[14px] text-[var(--label-secondary)]">
              {t(
                connectionState === "connected"
                  ? "sidebar.hubConnected"
                  : connectionState === "connecting"
                    ? "sidebar.hubConnecting"
                    : "sidebar.hubDisconnected",
              )}
            </span>
          </span>
        </button>
        <nav
          className="sidebar-navigation flex shrink-0 items-center gap-1"
          aria-label={t("navigation.main")}
        >
          <Button
            size="icon"
            type="button"
            onClick={onNewInstance}
            title={t("sidebar.newInstance")}
            aria-label={t("sidebar.newInstance")}
            className="navigation-create"
          >
            <Plus size={18} aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title={t("sidebar.settings")}
            aria-label={t("sidebar.settings")}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className="navigation-item"
          >
            <SettingsIcon size={18} aria-hidden="true" />
          </button>
        </nav>
      </header>

      <section
        className="instance-list flex min-h-0 min-w-0 flex-1 flex-col"
        aria-label={t("navigation.instances")}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2 scrollbar-auto">
          {instances.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] leading-[20px] text-[var(--label-secondary)]">
              <Server
                size={24}
                className="mx-auto mb-3 opacity-60"
                aria-hidden="true"
              />
              {t("sidebar.noInstances")}
            </div>
          ) : (
            edgeGroups.map(([edgeId, groupInstances]) => (
              <section
                key={edgeId}
                className="mb-3"
                data-edge-id={edgeId}
                aria-label={edgeId}
              >
                <div className="sidebar-edge-header flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={!collapsedEdges[edgeId]}
                    aria-controls={`${sidebarId}-edge-${encodeURIComponent(edgeId)}`}
                    aria-label={t("sidebar.toggleMachine", { edgeId })}
                    title={edgeId}
                    onClick={() => toggleEdge(edgeId)}
                    className="sidebar-edge-toggle flex min-w-0 flex-1 items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-[11px] leading-[16px] text-[var(--label-secondary)]"
                  >
                    <ChevronRight
                      size={12}
                      className={`shrink-0 ${collapsedEdges[edgeId] ? "" : "rotate-90"}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{edgeId}</span>
                    <span className="shrink-0 tabular-nums">
                      ({groupInstances.length})
                    </span>
                  </button>
                  <Popover
                    label={t("sidebar.machineActions", { edgeId })}
                    placement="bottom"
                    trigger={({ open, id }) => (
                      <Button
                        size="icon"
                        type="button"
                        className="sidebar-edge-actions"
                        aria-label={t("sidebar.machineActions", { edgeId })}
                        title={t("sidebar.machineActions", { edgeId })}
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        aria-controls={open ? id : undefined}
                      >
                        {copiedEdgeId === edgeId ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <MoreHorizontal size={14} aria-hidden="true" />
                        )}
                      </Button>
                    )}
                  >
                    {(close) => (
                      <div className="p-2">
                        <MenuItem
                          onClick={() => {
                            handleCopyEdgeId(edgeId);
                            close();
                          }}
                        >
                          <Copy size={14} aria-hidden="true" />
                          {t("sidebar.copyMachineId")}
                        </MenuItem>
                      </div>
                    )}
                  </Popover>
                </div>
                <ul
                  id={`${sidebarId}-edge-${encodeURIComponent(edgeId)}`}
                  hidden={!!collapsedEdges[edgeId]}
                  className="space-y-1"
                >
                  {groupInstances.map((instance) => {
                    const name =
                      instance.cwd.split("/").filter(Boolean).pop() ||
                      instance.cwd;
                    const statusKey = getInstanceStatusKey(instance.status);
                    const percent = instance.contextUsage?.percent;
                    return (
                      <li
                        key={instance.id}
                        data-instance-id={instance.id}
                        className="instance-row relative"
                        data-selected={selectedId === instance.id || undefined}
                      >
                        <button
                          type="button"
                          data-instance-select
                          title={instance.cwd}
                          aria-current={
                            selectedId === instance.id ? "page" : undefined
                          }
                          onClick={() => {
                            if (longPressFiredRef.current) {
                              longPressFiredRef.current = false;
                              return;
                            }
                            onSelect(instance.id);
                          }}
                          onTouchStart={(event) =>
                            handleTouchStart(event, instance.id)
                          }
                          onTouchEnd={cancelLongPress}
                          onTouchMove={cancelLongPress}
                          onTouchCancel={cancelLongPress}
                          className="instance-item w-full rounded-control text-left"
                        >
                          <span
                            className={`instance-status h-2 w-2 rounded-full ${getInstanceStatusDotClass(instance.status)}`}
                            title={t(statusKey)}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--label-primary)]">
                              {name}
                            </div>
                            <span className="sr-only">{t(statusKey)}</span>
                            <div className="mt-0.5 truncate text-[11px] leading-[14px] text-[var(--label-secondary)]">
                              {instance.model.name ||
                                `${instance.model.provider}/${instance.model.id}`}
                            </div>
                            {percent != null && percent > 0 && (
                              <div
                                className="instance-progress-track mt-1.5 h-[3px] overflow-hidden rounded-full bg-[var(--fill-quaternary)]"
                                role="progressbar"
                                aria-label={t("composer.contextUsage")}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.min(
                                  100,
                                  Math.max(0, percent),
                                )}
                              >
                                <div
                                  className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
                                  style={{
                                    width: `${Math.max(2, Math.min(100, percent))}%`,
                                    backgroundColor:
                                      percent >= 90
                                        ? "var(--toast-icon-error)"
                                        : percent >= 60
                                          ? "var(--toast-icon-warning)"
                                          : "var(--toast-icon-success)",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </button>
                        <Button
                          size="icon"
                          type="button"
                          aria-label={t("navigation.instanceActions", { name })}
                          title={t("navigation.instanceActions", { name })}
                          className="instance-actions absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-[var(--label-secondary)]"
                          onClick={(event) => {
                            const rect =
                              event.currentTarget.getBoundingClientRect();
                            setContextMenu({
                              position: { x: rect.left, y: rect.bottom },
                              instanceId: instance.id,
                            });
                          }}
                        >
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            key={contextMenu.instanceId}
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          >
            <ContextMenuItem
              icon={<LogOut size={14} />}
              label={t("sidebar.shutdown")}
              danger
              onClick={() => {
                onShutdown(contextMenu.instanceId);
                setContextMenu(null);
              }}
            />
          </ContextMenu>
        )}
      </AnimatePresence>
    </aside>
  );
}
