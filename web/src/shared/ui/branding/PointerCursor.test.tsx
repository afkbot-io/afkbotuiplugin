import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PointerCursor } from "@/shared/ui/branding/PointerCursor";

describe("PointerCursor", () => {
  it("reveals the custom cursor and highlights interactive targets on mouse movement", () => {
    const { container } = render(
      <div>
        <button type="button">Open panel</button>
        <PointerCursor />
      </div>,
    );

    const dot = container.querySelector(".cursor-dot");
    const ring = container.querySelector(".cursor-ring");

    expect(dot).toHaveClass("is-hidden");
    expect(ring).toHaveClass("is-hidden");

    fireEvent.mouseMove(screen.getByRole("button", { name: "Open panel" }), {
      clientX: 40,
      clientY: 24,
    });

    expect(dot).not.toHaveClass("is-hidden");
    expect(ring).not.toHaveClass("is-hidden");
    expect(ring).toHaveClass("is-hover");

    fireEvent.mouseLeave(window);

    expect(dot).toHaveClass("is-hidden");
    expect(ring).toHaveClass("is-hidden");
  });
});
