// 整体玻璃侧栏：全局入口与按 Edge 分组的实例列表

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  Settings as SettingsIcon,
  Home,
  LogOut,
  Plus,
  Check,
  Copy,
  Server,
  MoreHorizontal,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router";
import type { InstanceInfo, InstanceId } from "../../../protocol/types";
import { useLogoSrc } from "../hooks/useLogoSrc";
import { ConnectionIndicator } from "./ui/ConnectionIndicator";
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

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, instanceId: InstanceId) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        instanceId,
      });
    },
    [],
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
    <aside className="sidebar-layout select-none glass-panel flex min-h-0 w-full flex-1 flex-col overflow-hidden md:w-[300px] md:flex-none lg:w-[328px]">
      <header className="sidebar-header flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4">
        <img
          src={logoSrc}
          alt={t("navigation.brand")}
          className="h-8 w-8 shrink-0 object-contain"
        />
        <nav
          className="sidebar-navigation flex shrink-0 items-center gap-1"
          aria-label={t("navigation.main")}
        >
          <button
            type="button"
            onClick={() => navigate("/")}
            title={t("navigation.home")}
            aria-label={t("navigation.home")}
            aria-current={pathname === "/" ? "page" : undefined}
            className="navigation-item"
          >
            <Home size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            title={t("sidebar.settings")}
            aria-label={t("sidebar.settings")}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className="navigation-item"
          >
            <SettingsIcon size={19} aria-hidden="true" />
          </button>
        </nav>
      </header>

      <section
        className="instance-list flex min-h-0 min-w-0 flex-1 flex-col"
        aria-label={t("navigation.instances")}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-2">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold leading-[26px] text-[var(--label-primary)]">
              {t("navigation.instances")}
            </h1>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-[var(--label-secondary)]">
              <span className="truncate">
                {t("sidebar.machine", { count: edgeGroups.length })}
                {" · "}
                {t("sidebar.instance", { count: instances.length })}
              </span>
              <span
                className="flex shrink-0 items-center"
                aria-label={t("navigation.connection")}
              >
                <ConnectionIndicator />
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onNewInstance}
            title={t("sidebar.newInstance")}
            aria-label={t("sidebar.newInstance")}
            className="navigation-create flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 scrollbar-auto">
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
                className="mb-5"
                data-edge-id={edgeId}
                aria-label={edgeId}
              >
                <button
                  type="button"
                  onClick={() => handleCopyEdgeId(edgeId)}
                  title={t("navigation.copyEdge", { edgeId })}
                  aria-label={t("navigation.copyEdge", { edgeId })}
                  className="flex min-h-9 max-w-full items-center gap-2 rounded-[10px] px-3 text-[11px] font-semibold text-[var(--label-secondary)] hover:bg-[var(--fill-quaternary)]"
                >
                  <Server size={12} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{edgeId}</span>
                  {copiedEdgeId === edgeId ? (
                    <Check
                      size={11}
                      className="shrink-0 text-[var(--toast-icon-success)]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy
                      size={11}
                      className="shrink-0 opacity-50"
                      aria-hidden="true"
                    />
                  )}
                </button>
                <ul className="space-y-1">
                  {groupInstances.map((instance) => {
                    const name =
                      instance.cwd.split("/").filter(Boolean).pop() ||
                      instance.cwd;
                    const statusKey =
                      instance.status === "streaming"
                        ? "sidebar.statusStreaming"
                        : instance.status === "compacting"
                          ? "sidebar.statusCompacting"
                          : "sidebar.statusIdle";
                    const percent = instance.contextUsage?.percent;
                    return (
                      <li
                        key={instance.id}
                        data-instance-id={instance.id}
                        className="group relative"
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
                          onContextMenu={(event) =>
                            handleContextMenu(event, instance.id)
                          }
                          onTouchStart={(event) =>
                            handleTouchStart(event, instance.id)
                          }
                          onTouchEnd={cancelLongPress}
                          onTouchMove={cancelLongPress}
                          onTouchCancel={cancelLongPress}
                          className="instance-item w-full rounded-[16px] border border-transparent px-3 py-3 pr-[48px] text-left"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${instance.status === "streaming" ? "bg-[var(--color-accent)] animate-pulse motion-reduce:animate-none" : instance.status === "compacting" ? "bg-[var(--toast-icon-warning)] animate-pulse motion-reduce:animate-none" : "bg-[var(--toast-icon-success)]"}`}
                              title={t(statusKey)}
                            />
                            <span className="truncate text-[14px] font-medium leading-[20px] text-[var(--label-primary)]">
                              {name}
                            </span>
                            <span className="sr-only">{t(statusKey)}</span>
                          </div>
                          <div className="ml-4.5 mt-1 truncate text-[11px] leading-[16px] text-[var(--label-secondary)]">
                            {instance.model.name ||
                              `${instance.model.provider}/${instance.model.id}`}
                          </div>
                          {percent != null && percent > 0 && (
                            <div
                              className="ml-4.5 mt-2 h-[3px] overflow-hidden rounded-full bg-[var(--fill-quaternary)]"
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
                        </button>
                        <button
                          type="button"
                          aria-label={t("navigation.instanceActions", { name })}
                          title={t("navigation.instanceActions", { name })}
                          className="absolute right-2 top-2 flex h-[36px] w-[36px] items-center justify-center rounded-full text-[var(--label-secondary)] hover:bg-[var(--fill-secondary)] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100"
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
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>
      {contextMenu && (
        <ContextMenu
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
    </aside>
  );
}
