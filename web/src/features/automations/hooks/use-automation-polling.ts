import { useEffect, useRef } from "react";

type PollingArgs = {
  active: boolean;
  enabled: boolean;
  intervalMs: number;
  onPoll: () => Promise<void> | void;
};

export function useAutomationPolling({ active, enabled, intervalMs, onPoll }: PollingArgs) {
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
      if (document.activeElement?.matches("input, textarea, select")) {
        return;
      }
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      Promise.resolve(onPollRef.current()).finally(() => {
        inFlightRef.current = false;
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
      inFlightRef.current = false;
    };
  }, [active, enabled, intervalMs]);
}
