import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { Popover } from "./Popover";

export interface AdaptiveToolbarItem {
  id: string;
  priority: number;
  flexible?: boolean;
  minimumLabelWidth?: number;
  control: ReactNode;
  menu: (close: () => void, showPage: (id: string) => void) => ReactNode;
  pageLabel?: string;
  page?: (close: () => void) => ReactNode;
}

interface AdaptiveToolbarProps {
  items: AdaptiveToolbarItem[];
}

export function AdaptiveToolbar({ items }: AdaptiveToolbarProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const moreRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pageItem = items.find((item) => item.id === page);

  useLayoutEffect(() => {
    if (open) return;
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (!width) return;
      const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
      const sizes = items.map((item) => {
        const control = itemRefs.current.get(item.id);
        const label = item.flexible
          ? control?.querySelector<HTMLElement>("[data-toolbar-label]")
          : null;
        const measured = control?.getBoundingClientRect().width ?? 0;
        const natural = label
          ? measured + label.scrollWidth - label.getBoundingClientRect().width
          : measured;
        const minimum = label
          ? natural -
            label.scrollWidth +
            Math.min(item.minimumLabelWidth ?? 0, label.scrollWidth)
          : natural;
        return {
          id: item.id,
          priority: item.priority,
          width: minimum,
          natural,
          control,
          flexible: item.flexible,
        };
      });
      let used =
        sizes.reduce((sum, item) => sum + item.width, 0) +
        Math.max(0, sizes.length - 1) * gap;
      const hidden: string[] = [];
      if (used > width) {
        used += (moreRef.current?.getBoundingClientRect().width ?? 0) + gap;
        for (const item of [...sizes].sort((a, b) => a.priority - b.priority)) {
          if (used <= width) break;
          hidden.push(item.id);
          used -= item.width + gap;
        }
      }
      let remaining = Math.max(0, width - used);
      for (const item of sizes) {
        if (!item.flexible || hidden.includes(item.id)) continue;
        const extra = Math.min(
          remaining,
          Math.max(0, item.natural - item.width),
        );
        const value = `${item.width + extra}px`;
        if (
          item.control?.style.getPropertyValue("--toolbar-item-width") !== value
        ) {
          item.control?.style.setProperty("--toolbar-item-width", value);
        }
        remaining -= extra;
      }
      setOverflow((current) =>
        current.length === hidden.length &&
        current.every((id, index) => id === hidden[index])
          ? current
          : hidden,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    for (const label of element.querySelectorAll(
      "[data-toolbar-label-content]",
    )) {
      observer?.observe(label);
    }
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [items, open]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const hidden = [...element.querySelectorAll(".adaptive-toolbar-hidden")];
    if (hidden.some((item) => item.contains(document.activeElement))) {
      element
        .querySelector<HTMLButtonElement>(
          ".adaptive-toolbar-item:not(.adaptive-toolbar-hidden) button:not(:disabled), .adaptive-toolbar-more:not(.adaptive-toolbar-hidden) button",
        )
        ?.focus();
    }
  }, [overflow]);

  useLayoutEffect(() => {
    if (open)
      menuRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [page, open]);

  return (
    <div ref={ref} className="composer-controls adaptive-toolbar">
      {items.map((item) => (
        <div
          key={item.id}
          ref={(element) => {
            if (element) itemRefs.current.set(item.id, element);
            else itemRefs.current.delete(item.id);
          }}
          data-toolbar-item={item.id}
          className={`adaptive-toolbar-item${item.flexible ? " adaptive-toolbar-flexible" : ""}${overflow.includes(item.id) ? " adaptive-toolbar-hidden" : ""}`}
          inert={overflow.includes(item.id) || undefined}
          aria-hidden={overflow.includes(item.id) || undefined}
        >
          {item.control}
        </div>
      ))}
      <div
        ref={moreRef}
        className={`adaptive-toolbar-more${overflow.length ? "" : " adaptive-toolbar-hidden"}`}
        inert={!overflow.length || undefined}
        aria-hidden={!overflow.length || undefined}
      >
        <Popover
          label={t("composer.more")}
          width={280}
          align="left"
          onOpenChange={(value) => {
            setOpen(value);
            setPage(null);
          }}
          trigger={({ open, id }) => (
            <Button
              size="compact"
              className="composer-control"
              aria-label={t("composer.more")}
              title={t("composer.more")}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? id : undefined}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </Button>
          )}
        >
          {(close) => (
            <div
              ref={menuRef}
              className={
                pageItem?.page
                  ? "ui-menu-layout"
                  : "ui-menu-scroll scrollbar-auto"
              }
              style={{ maxHeight: "inherit" }}
            >
              {pageItem?.page ? (
                <>
                  <div className="adaptive-toolbar-page-header">
                    <Button
                      size="compact"
                      aria-label={t("composer.backToOptions")}
                      onClick={() => setPage(null)}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                    </Button>
                    <span>{pageItem.pageLabel}</span>
                  </div>
                  {pageItem.page(close)}
                </>
              ) : (
                items
                  .filter((item) => overflow.includes(item.id))
                  .map((item) => (
                    <div key={item.id}>{item.menu(close, setPage)}</div>
                  ))
              )}
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
}
