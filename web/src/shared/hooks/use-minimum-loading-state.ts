import { useEffect, useRef, useState } from "react";

export function useMinimumLoadingState(active: boolean, minimumVisibleMs: number) {
  const [visible, setVisible] = useState(active);
  const startedAtRef = useRef(active ? Date.now() : 0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (active) {
      startedAtRef.current = Date.now();
      if (!visible) {
        setVisible(true);
      }
      return;
    }

    if (!visible) {
      startedAtRef.current = 0;
      return;
    }

    const elapsedMs = Date.now() - startedAtRef.current;
    const remainingMs = Math.max(0, minimumVisibleMs - elapsedMs);
    if (remainingMs <= 0) {
      startedAtRef.current = 0;
      setVisible(false);
      return;
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startedAtRef.current = 0;
      setVisible(false);
    }, remainingMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, minimumVisibleMs, visible]);

  return visible;
}
