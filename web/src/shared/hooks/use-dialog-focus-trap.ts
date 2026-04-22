import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

export function useDialogFocusTrap({
  containerRef,
  onClose,
  open,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
}) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const focusable = getFocusableElements(container);
    const target = focusable[0] || container;
    target.focus({ preventScroll: true });

    return () => {
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [containerRef, open]);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const focusable = getFocusableElements(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    },
    [containerRef, onClose],
  );
}
