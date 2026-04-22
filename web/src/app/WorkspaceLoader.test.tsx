import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceLoader } from "@/app/WorkspaceLoader";

describe("WorkspaceLoader", () => {
  it("renders the branded rabbit loader contract for workspace boot", () => {
    const { container } = render(<WorkspaceLoader />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Preparing workspace shell")).toBeInTheDocument();
    expect(screen.getByText("dist runtime online")).toBeInTheDocument();
    expect(screen.getByText("Bringing the workspace online.")).toBeInTheDocument();
    expect(container.querySelector(".workspace-loader__mascot")).not.toBeNull();
    expect(container.querySelector(".rabbit-svg")).not.toBeNull();
  });
});
