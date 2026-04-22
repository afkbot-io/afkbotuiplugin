import { useEffect, useRef } from "react";

type TaskFlowPollingArgs = {
  active: boolean;
  enabled: boolean;
  intervalMs: number;
  onPoll: (incremental?: boolean) => Promise<void> | void;
};

export function useTaskFlowPolling({ active, enabled, intervalMs, onPoll }: TaskFlowPollingArgs) {
  const onPollRef = useRef(onPoll);
  const inFlightRef = useRef(false);

  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  useEffect(() => {
    if (!active || !enabled || intervalMs <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.hidden || document.activeElement?.matches("input, textarea, select")) {
        return;
      }
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      Promise.resolve(onPollRef.current(true)).finally(() => {
        inFlightRef.current = false;
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
      inFlightRef.current = false;
    };
  }, [active, enabled, intervalMs]);
}
