import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMinimumLoadingState } from "@/shared/hooks/use-minimum-loading-state";

describe("useMinimumLoadingState", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the loader visible until the minimum duration elapses", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ active }) => useMinimumLoadingState(active, 500),
      {
        initialProps: { active: true },
      },
    );

    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it("cancels a pending hide when the loading state becomes active again", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ active }) => useMinimumLoadingState(active, 300),
      {
        initialProps: { active: true },
      },
    );

    rerender({ active: false });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    rerender({ active: true });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe(true);

    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(false);
  });

  it("preserves the minimum window after a new activation that starts from an idle state", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ active }) => useMinimumLoadingState(active, 400),
      {
        initialProps: { active: false },
      },
    );

    expect(result.current).toBe(false);

    rerender({ active: true });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
