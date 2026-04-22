import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { useDialogFocusTrap } from "@/shared/hooks/use-dialog-focus-trap";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const handleKeyDown = useDialogFocusTrap({
    containerRef: dialogRef,
    onClose: () => setOpen(false),
    open,
  });

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Open Modal
      </button>
      {open ? (
        <div aria-label="Test Dialog" aria-modal="true" onKeyDown={handleKeyDown} ref={dialogRef} role="dialog" tabIndex={-1}>
          <button type="button">First Action</button>
          <button type="button">Second Action</button>
        </div>
      ) : null}
    </div>
  );
}

describe("useDialogFocusTrap", () => {
  it("focuses the first dialog control, wraps tab order, and restores focus on close", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const opener = screen.getByRole("button", { name: "Open Modal" });
    opener.focus();

    await user.click(opener);
    expect(screen.getByRole("button", { name: "First Action" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Second Action" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "First Action" })).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: "Second Action" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Test Dialog" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
