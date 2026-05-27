import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TaskDocumentsPage } from "./TaskDocumentsPage";

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("TaskDocumentsPage", () => {
  it("lists workspace documents with filters and preview", async () => {
    const api = {
      confirmTaskFlowDocument: vi.fn(),
      listTaskFlowDocumentWorkspace: vi.fn(async () => ({
        task_documents: [
          {
            body: "Implementation notes for the agent handoff.",
            confirmation_status: "draft",
            document_key: "handoff",
            id: "doc-1",
            revision: 2,
            scope_id: "task-1",
            scope_type: "task",
            title: "Agent handoff",
            updated_at: "2026-05-27T10:00:00Z",
          },
        ],
      })),
    };

    renderWithClient(
      <TaskDocumentsPage
        active
        api={api}
        config={{ task_flow_actor_ref: "operator", task_flow_actor_type: "human" }}
        notify={vi.fn()}
        profileId="default"
        profiles={[]}
        updateConfig={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: /Agent handoff/ })).toBeInTheDocument();
    expect(screen.getAllByText("Implementation notes for the agent handoff.")).toHaveLength(2);

    await userEvent.type(screen.getByLabelText("Search"), "handoff");
    await userEvent.selectOptions(screen.getByLabelText("Scope"), "task");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "draft");

    await waitFor(() => {
      expect(api.listTaskFlowDocumentWorkspace).toHaveBeenLastCalledWith(
        "default",
        expect.objectContaining({
          confirmation_status: "draft",
          query: "handoff",
          scope_type: "task",
        }),
      );
    });
  });

  it("confirms the selected document with the configured actor", async () => {
    const notify = vi.fn();
    const api = {
      confirmTaskFlowDocument: vi.fn(async () => ({ task_document: { id: "doc-1" } })),
      listTaskFlowDocumentWorkspace: vi.fn(async () => ({
        task_documents: [
          {
            body: "QA notes.",
            confirmation_status: "draft",
            document_key: "qa",
            id: "doc-1",
            revision: 3,
            scope_id: "flow-1",
            scope_type: "flow",
            title: "QA notes",
          },
        ],
      })),
    };

    renderWithClient(
      <TaskDocumentsPage
        active
        api={api}
        config={{ task_flow_actor_ref: "lead", task_flow_actor_type: "human" }}
        notify={notify}
        profileId="default"
        profiles={[]}
        updateConfig={vi.fn()}
      />,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(api.confirmTaskFlowDocument).toHaveBeenCalledWith("default", "doc-1", {
      actor_ref: "lead",
      actor_type: "human",
      expected_revision: 3,
    });
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Document confirmed.", "success"));
  });
});
