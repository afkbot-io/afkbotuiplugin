import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/shared/ui/PageHeader";

describe("PageHeader", () => {
  it("renders eyebrow, title, subtitle, and actions inside the shared header shell", () => {
    render(
      <PageHeader
        actions={<button type="button">Create</button>}
        className="page-header--test"
        eyebrow="Workspace / Automations"
        subtitle="Control plane for scheduled and interactive runs."
        title="Automations"
      />,
    );

    expect(screen.getByText("Workspace / Automations")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Automations" })).toBeInTheDocument();
    expect(screen.getByText("Control plane for scheduled and interactive runs.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(document.querySelector(".page-header.page-header--test")).not.toBeNull();
  });
});
