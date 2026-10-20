import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LazyMotion,
  MotionConfigContext,
  useDragControls,
  useIsPresent,
  useReducedMotion,
  useMotionValue,
  type PanInfo,
} from "motion/react";
import * as m from "motion/react-m";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { cycleDialogFocus, useNativeDialog } from "./useNativeDialog";

interface ModalShellProps {
  title: React.ReactNode;
  trailing?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  mobileSheet?: boolean;
  size?: "detail" | "form";
  footer?: React.ReactNode;
}

const loadFeatures = () =>
  import("./modalFeatures").then((module) => module.default);

/** 根据下滑距离、方向和速度判断关闭手势。 */
export function shouldDismissSheet(
  info: Pick<PanInfo, "offset" | "velocity">,
  height: number,
) {
  const distance = info.offset.y;
  return (
    distance > Math.abs(info.offset.x) &&
    (distance >= Math.min(140, Math.max(80, height * 0.2)) ||
      (distance >= 40 && info.velocity.y >= 600))
  );
}

/** 调用位置通过 AnimatePresence 保留退出期间的窗口。 */
export function ModalShell(props: ModalShellProps) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <ModalContent {...props} />
    </LazyMotion>
  );
}

function ModalContent({
  title,
  trailing,
  onClose,
  children,
  mobileSheet = true,
  size = "detail",
  footer,
}: ModalShellProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropPress = useRef<boolean | null>(null);
  const present = useIsPresent();
  const motionPolicy = useContext(MotionConfigContext).reducedMotion;
  const reducedMotion = useReducedMotion() || motionPolicy === "always";
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  const sheet = mobileSheet && mobile;
  useNativeDialog(dialogRef, closeRef);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      dragControls.cancel();
      y.set(0);
      setMobile(query.matches);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [dragControls, y]);

  function requestClose() {
    if (present) onClose();
  }

  const transition = {
    duration: reducedMotion ? 0 : 0.2,
    ease: "easeOut" as const,
  };
  const exitTransition = {
    duration: reducedMotion ? 0 : 0.15,
    ease: "easeIn" as const,
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-presence={present ? "present" : "exiting"}
      className="native-dialog-viewport modal-viewport fixed-viewport"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
      onKeyDown={cycleDialogFocus}
    >
      <m.div
        className="modal-overlay pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden="true"
        initial={{ opacity: reducedMotion ? 1 : 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exitTransition }}
        transition={transition}
      />
      <div
        className="modal-positioner absolute inset-0 flex items-center justify-center"
        data-sheet={sheet}
        onPointerDown={(event) => {
          backdropPress.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (
            event.target === event.currentTarget &&
            backdropPress.current !== false
          )
            requestClose();
          backdropPress.current = null;
        }}
      >
        <m.div
          ref={panelRef}
          data-size={size}
          className="modal-panel flex min-h-0 flex-col overflow-hidden"
          data-sheet={sheet}
          style={{ y }}
          initial={
            reducedMotion
              ? false
              : {
                  opacity: sheet ? 1 : 0,
                  scale: sheet ? 1 : 0.96,
                  y: sheet ? "100%" : 0,
                }
          }
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{
            opacity: sheet ? 1 : 0,
            scale: reducedMotion || sheet ? 1 : 0.96,
            y: !reducedMotion && sheet ? "100%" : 0,
            transition: exitTransition,
          }}
          transition={transition}
          drag={sheet && present && !reducedMotion ? "y" : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 1 }}
          dragSnapToOrigin
          dragMomentum={false}
          onDragEnd={(event, info) => {
            if (
              event.type !== "pointercancel" &&
              shouldDismissSheet(info, panelRef.current?.clientHeight ?? 0)
            )
              requestClose();
          }}
        >
          <div
            className="modal-interior flex min-h-0 flex-1 flex-col"
            inert={!present}
          >
            {sheet && (
              <m.div
                className="modal-grabber flex h-6 shrink-0 items-center justify-center select-none"
                aria-hidden="true"
                onPanEnd={(event, info) => {
                  if (
                    reducedMotion &&
                    event.type !== "pointercancel" &&
                    shouldDismissSheet(
                      info,
                      panelRef.current?.clientHeight ?? 0,
                    )
                  )
                    requestClose();
                }}
                onPointerDown={(event) => {
                  if (!reducedMotion && event.isPrimary && event.button === 0)
                    dragControls.start(event, { distanceThreshold: 10 });
                }}
              >
                <span className="h-1 w-9 rounded-full bg-[var(--label-tertiary)]" />
              </m.div>
            )}
            <header className="modal-header flex shrink-0 items-center justify-between gap-3 border-b border-[var(--separator)] px-4 py-1.5">
              <div
                id={titleId}
                className="flex min-w-0 flex-wrap items-center gap-2 text-[15px] font-semibold text-[var(--label-primary)] select-text"
              >
                {title}
              </div>
              <div className="flex shrink-0 items-center gap-2 select-text">
                {trailing}
                <Button
                  size="icon"
                  ref={closeRef}
                  type="button"
                  onClick={requestClose}
                  aria-label={t("common.close")}
                  className="modal-close select-none flex items-center justify-center rounded-full text-[var(--label-secondary)] transition-colors hover:bg-[var(--fill-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] motion-reduce:transition-none"
                >
                  <X size={18} aria-hidden="true" />
                </Button>
              </div>
            </header>
            <div
              className="modal-content min-h-0 flex-1 overflow-auto scrollbar-auto"
              tabIndex={0}
              role="region"
              aria-label={t("modal.content")}
            >
              {children}
            </div>
            {footer && <footer className="ui-dialog-actions">{footer}</footer>}
          </div>
        </m.div>
      </div>
    </dialog>,
    document.body,
  );
}
