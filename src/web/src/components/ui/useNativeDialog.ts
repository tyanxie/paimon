import { useLayoutEffect, type RefObject, type KeyboardEvent } from "react";

let activeDialogs = 0;
let previousOverflow = "";

/** 原生 dialog 管理模态交互；滚动限制持续到最后一个窗口卸载。 */
export function useNativeDialog(
  dialogRef: RefObject<HTMLDialogElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    if (activeDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialog.showModal();
    initialFocusRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (--activeDialogs === 0) {
        document.body.style.overflow = previousOverflow;
      }
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [dialogRef, initialFocusRef]);
}

/** Tab 在窗口内循环，原生 dialog 继续负责背景焦点限制。 */
export function cycleDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (
    event.defaultPrevented ||
    event.key !== "Tab" ||
    !event.currentTarget.contains(event.target as Node)
  )
    return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
    ),
  ).filter((element) => {
    const style = getComputedStyle(element);
    return (
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[hidden], [inert]") &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  });
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    !controls.includes(activeElement)
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus({ preventScroll: true });
  } else if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}
