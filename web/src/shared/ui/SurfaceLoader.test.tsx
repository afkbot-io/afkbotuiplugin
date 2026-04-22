import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

describe("SurfaceLoader", () => {
  it("renders the branded console contract for panel loading states", () => {
    render(<SurfaceLoader message="Preparing workspace skin." title="Applying theme" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("runtime sync")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Applying theme" })).toBeInTheDocument();
    expect(screen.getByText("Preparing workspace skin.")).toBeInTheDocument();
  });
});
