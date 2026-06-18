import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { EmployeesPage } from "@/features/employees/EmployeesPage";

vi.mock("@xyflow/react/dist/style.css", () => ({}));
vi.mock("@xyflow/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    ReactFlow: ({ nodes }: { nodes: Array<{ data?: { label?: string }; id: string }> }) =>
      React.createElement(
        "div",
        { "data-testid": "employee-graph" },
        nodes.map((node) => React.createElement("button", { key: node.id, type: "button" }, node.data?.label || node.id)),
      ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

function renderWithClient(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function createApi() {
  return {
    createTaskFlowEmployee: vi.fn(async (_profileId: string, payload: Record<string, unknown>) => ({
      employee: {
        ...payload,
        id: String(payload.id || "delivery-lead"),
      },
    })),
    deleteTaskFlowEmployee: vi.fn(async () => ({ ok: true })),
    getTaskFlowOrgChart: vi.fn(async () => ({
      org_chart: {
        edges: [],
        employees: {
          cto: {
            allowed_tools: ["*"],
            body: "Owns intake.",
            can_use_subagents: true,
            derived_reports: [],
            id: "cto",
            manager_id: null,
            name: "CTO",
            role: "executive_orchestrator",
            status: "active",
            subagent_allowlist: [],
            title: "Technical Director",
          },
        },
        profile_id: "default",
        root_employee_ids: ["cto"],
        validation: { issues: [], valid: true },
      },
    })),
    listSubagents: vi.fn(async () => ({
      subagents: [
        {
          name: "backend-reviewer",
          path: "subagents/backend-reviewer.md",
          summary: "Reviews backend changes.",
        },
      ],
    })),
    listTaskFlowEmployees: vi.fn(async () => ({
      employees: [
        {
          id: "cto",
          is_root: true,
          name: "CTO",
          owner_ref: "cto",
          role: "executive_orchestrator",
          status: "active",
          title: "Technical Director",
        },
      ],
    })),
    updateTaskFlowEmployee: vi.fn(async (_profileId: string, employeeId: string, payload: Record<string, unknown>) => ({
      employee: { ...payload, id: employeeId },
    })),
  };
}

describe("EmployeesPage", () => {
  it("uses selectable tool and subagent controls instead of raw allowlist typing", async () => {
    const user = userEvent.setup();
    const api = createApi();

    renderWithClient(
      <EmployeesPage
        active
        api={api}
        config={{}}
        notify={vi.fn()}
        profileId="default"
        profiles={[{ id: "default", title: "Default" }]}
        updateConfig={vi.fn(async (patch: Record<string, unknown>) => patch)}
      />,
    );

    await screen.findByRole("button", { name: /CTO\s+Technical Director/i });
    await user.click(screen.getByRole("button", { name: "New Employee" }));

    const dialog = await screen.findByRole("dialog", { name: /Create Employee/i });
    expect(within(dialog).queryByLabelText("Advanced allowlist")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Task Flow")).toBeInTheDocument();
    expect(within(dialog).getByText("Memory / Docs")).toBeInTheDocument();
    expect(within(dialog).getByText("All access")).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText(/Allow this employee to start CLI subagents/i));
    await user.click(within(dialog).getByLabelText("Only selected subagents"));

    expect(await within(dialog).findByText("backend-reviewer")).toBeInTheDocument();
    expect(within(dialog).queryByPlaceholderText(/reviewer/i)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Name"), "Delivery Lead");
    await user.clear(within(dialog).getByLabelText("Title"));
    await user.type(within(dialog).getByLabelText("Title"), "Delivery Lead");
    await user.clear(within(dialog).getByLabelText("Role"));
    await user.type(within(dialog).getByLabelText("Role"), "delivery_lead");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(api.createTaskFlowEmployee).toHaveBeenCalled();
    });
    expect(api.createTaskFlowEmployee.mock.calls[0][1]).toMatchObject({
      allowed_tools: ["task.*", "memory.*", "file.read", "subagent.run"],
      can_use_subagents: true,
      subagent_allowlist: ["backend-reviewer"],
    });
  });
});
