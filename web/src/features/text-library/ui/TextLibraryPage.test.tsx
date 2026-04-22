import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { TextLibraryDefinition, TextLibraryItem } from "@/features/text-library/model/text-library.types";
import { TextLibraryPage, type TextLibraryPageHandle } from "@/features/text-library/ui/TextLibraryPage";

type TestApi = {
  create: (profileId: string, draft: { content: string; id: string }) => Promise<TextLibraryItem>;
  get: (profileId: string, itemId: string) => Promise<TextLibraryItem>;
  list: (profileId: string, query: string) => Promise<TextLibraryItem[]>;
  remove: (profileId: string, item: TextLibraryItem) => Promise<void>;
  update: (profileId: string, item: TextLibraryItem, draft: { content: string; id: string }) => Promise<TextLibraryItem>;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

function createDefinition(): TextLibraryDefinition {
  return {
    entity: "skills",
    cardClass: "skill-card",
    contentFieldName: "content",
    contentRows: {
      create: 8,
      edit: 10,
    },
    gridClass: "cards-grid",
    defaultDraft() {
      return {
        id: "",
        content: "",
      };
    },
    draftFromItem(item) {
      return {
        id: item.id,
        content: item.content,
      };
    },
    idFieldName: "name",
    idReadonlyOnEdit: true,
    list: async (api, profileId, query) => (api as TestApi).list(profileId, query),
    get: async (api, profileId, itemId) => (api as TestApi).get(profileId, itemId),
    create: async (api, profileId, draft) => (api as TestApi).create(profileId, draft),
    update: async (api, profileId, item, draft) => (api as TestApi).update(profileId, item, draft),
    remove: async (api, profileId, item) => (api as TestApi).remove(profileId, item),
    validateCreate(draft) {
      if (!draft.id) {
        return "Name is required.";
      }
      if (!draft.content.trim()) {
        return "Content is required.";
      }
      return "";
    },
    validateUpdate(draft) {
      if (!draft.id) {
        return "Name is required.";
      }
      if (!draft.content.trim()) {
        return "Content is required.";
      }
      return "";
    },
    ui: {
      closeDeleteLabel: "Close delete modal",
      closeModalLabel: "Close create modal",
      closePanelLabel: "Close panel",
      contentLabel: "Content",
      contentTitle: "Content",
      createDescription: "Create a reusable item.",
      createEyebrow: "Create Item",
      createSubmitLabel: "Create Item",
      createSubmittingLabel: "Creating…",
      createSuccessLabel: "Item created.",
      createTitle: "New Item",
      deleteDescription: (item) => `Delete ${item.id}?`,
      deleteEyebrow: "Delete Item",
      deleteSubmitLabel: "Delete Item",
      deleteSubmittingLabel: "Deleting…",
      deleteSuccessLabel: "Item deleted.",
      deleteTitle: (item) => `Delete ${item.id}`,
      detailsEyebrow: "Details",
      editEyebrow: "Edit item",
      editSubmitLabel: "Save Changes",
      editSubmittingLabel: "Saving…",
      emptyDescription: "No items found.",
      emptySummaryLabel: "No summary available.",
      emptyTitle: "No Items",
      idLabel: "Name",
      idPlaceholder: "alpha",
      inspectorEmptyDescription: "Select an item.",
      inspectorEmptyTitle: "Inspector",
      loadingItemLabel: "Loading item…",
      loadingListLabel: "Loading items…",
      newLabel: "New Item",
      refreshLabel: "Refresh",
      searchHint: "Search by name.",
      searchPlaceholder: "Search items…",
      summaryTitle: "Summary",
      surfaceDescription: "Reusable definitions.",
      surfaceEyebrow: "Workspace / Items",
      surfaceTitle: "Items",
      updateSuccessLabel: "Item updated.",
      visibleLabel: (count) => `${count} visible`,
    },
  };
}

function createApi() {
  const store = new Map<string, TextLibraryItem[]>([
    [
      "default",
      [
        {
          id: "alpha",
          content: "Alpha content",
          summary: "Alpha summary",
          path: "profiles/default/alpha.md",
          cardBadges: [{ text: "skill", className: "badge badge--accent" }],
          detailBadges: [{ text: "skill", className: "badge badge--accent" }],
        },
      ],
    ],
    [
      "blue",
      [
        {
          id: "blue-item",
          content: "Blue content",
          summary: "Blue summary",
          path: "profiles/blue/blue-item.md",
          cardBadges: [{ text: "skill", className: "badge badge--accent" }],
          detailBadges: [{ text: "skill", className: "badge badge--accent" }],
        },
      ],
    ],
  ]);

  const clone = (item: TextLibraryItem) => ({ ...item, cardBadges: [...item.cardBadges], detailBadges: [...item.detailBadges] });

  const api = {
    list: vi.fn(async (profileId: string, query: string) => {
      const items = store.get(profileId) || [];
      const normalized = query.trim().toLowerCase();
      return items.filter((item) => !normalized || item.id.toLowerCase().includes(normalized)).map(clone);
    }),
    get: vi.fn(async (profileId: string, itemId: string) => {
      const item = (store.get(profileId) || []).find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error(`Missing item: ${itemId}`);
      }
      return clone(item);
    }),
    create: vi.fn(async (profileId: string, draft: { id: string; content: string }) => {
      const item = {
        id: draft.id,
        content: draft.content,
        summary: `${draft.id} summary`,
        path: `profiles/${profileId}/${draft.id}.md`,
        cardBadges: [{ text: "skill", className: "badge badge--accent" }],
        detailBadges: [{ text: "skill", className: "badge badge--accent" }],
      };
      store.set(profileId, [...(store.get(profileId) || []), item]);
      return clone(item);
    }),
    update: vi.fn(async (profileId: string, item: TextLibraryItem, draft: { id: string; content: string }) => {
      const nextItem = {
        ...item,
        id: draft.id,
        content: draft.content,
        summary: `${draft.id} summary`,
        path: `profiles/${profileId}/${draft.id}.md`,
      };
      store.set(
        profileId,
        (store.get(profileId) || []).map((entry) => (entry.id === item.id ? nextItem : entry)),
      );
      return clone(nextItem);
    }),
    remove: vi.fn(async (profileId: string, item: TextLibraryItem) => {
      store.set(
        profileId,
        (store.get(profileId) || []).filter((entry) => entry.id !== item.id),
      );
    }),
  } satisfies TestApi;

  return { api, store };
}

describe("TextLibraryPage", () => {
  it("uses modal dialog semantics for create and delete flows", async () => {
    const user = userEvent.setup();
    const { api } = createApi();

    renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    const openCreateButton = await screen.findByRole("button", { name: "New Item" });
    await user.click(openCreateButton);
    expect(screen.getByRole("dialog", { name: "New Item" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "New Item" })).not.toBeInTheDocument();
    expect(openCreateButton).toHaveFocus();

    await user.click(await screen.findByRole("button", { name: /alpha/i }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog", { name: "Delete alpha" })).toBeInTheDocument();
  });

  it("validates create form, creates an item, and opens it in the inspector", async () => {
    const user = userEvent.setup();
    const { api } = createApi();
    const notify = vi.fn();

    renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={notify}
        profileId="default"
      />,
    );

    expect(await screen.findByText("Items")).toBeInTheDocument();
    expect(await screen.findByText("alpha")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New Item" }));
    await user.click(screen.getByRole("button", { name: "Create Item" }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Name"), "beta");
    await user.type(screen.getByLabelText("Content"), "Beta content");
    await user.click(screen.getByRole("button", { name: "Create Item" }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith("default", {
        content: "Beta content",
        id: "beta",
      });
    });

    expect(await screen.findByRole("heading", { name: "beta" })).toBeInTheDocument();
    expect(await screen.findByText("Beta content")).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith("Item created.", "success");
  });

  it("keeps the inspector open after save and closes it after delete", async () => {
    const user = userEvent.setup();
    const { api } = createApi();

    renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    await user.click(await screen.findByRole("button", { name: /alpha/i }));
    expect(await screen.findByText("Alpha content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByLabelText("Content");
    await user.clear(editor);
    await user.type(editor, "Updated alpha content");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(api.update).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Updated alpha content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete Item" }));

    await waitFor(() => {
      expect(api.remove).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Select an item.")).toBeInTheDocument();
  });

  it("shows create pending state and blocks modal dismissal while saving", async () => {
    const user = userEvent.setup();
    const createRequest = deferred<TextLibraryItem>();
    const { api } = createApi();
    api.create.mockImplementationOnce(() => createRequest.promise);

    renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "New Item" }));
    await user.type(screen.getByLabelText("Name"), "gamma");
    await user.type(screen.getByLabelText("Content"), "Gamma content");
    await user.click(screen.getByRole("button", { name: "Create Item" }));

    expect(await screen.findByRole("button", { name: "Creating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "New Item" })).toBeInTheDocument();

    createRequest.resolve({
      id: "gamma",
      content: "Gamma content",
      summary: "Gamma summary",
      path: "profiles/default/gamma.md",
      cardBadges: [{ text: "skill", className: "badge badge--accent" }],
      detailBadges: [{ text: "skill", className: "badge badge--accent" }],
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New Item" })).not.toBeInTheDocument();
    });
  });

  it("preserves the applied search query and resets panel and modal state on profile change", async () => {
    const user = userEvent.setup();
    const { api } = createApi();

    const { client, rerender } = renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    await screen.findByText("alpha");
    await user.type(screen.getByLabelText("Search items…"), "alpha");
    await user.click(screen.getByRole("button", { name: "Apply Filters" }));

    await waitFor(() => {
      expect(api.list).toHaveBeenLastCalledWith("default", "alpha");
    });

    await user.click(screen.getByRole("button", { name: /alpha/i }));
    expect(await screen.findByText("Alpha content")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New Item" }));
    expect(screen.getByRole("heading", { name: "New Item" })).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <TextLibraryPage
          api={api}
          definition={createDefinition()}
          notify={vi.fn()}
          profileId="blue"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("No Items")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New Item" })).not.toBeInTheDocument();
    expect(screen.getByText("Select an item.")).toBeInTheDocument();
    expect(screen.getByLabelText("Search items…")).toHaveValue("alpha");
    expect(api.list).toHaveBeenLastCalledWith("blue", "alpha");
  });

  it("ignores stale create completions after a profile switch on the same mounted page", async () => {
    const user = userEvent.setup();
    let resolveCreate: ((value: TextLibraryItem) => void) | null = null;
    const { api } = createApi();
    const notify = vi.fn();
    (api as unknown as TestApi).create = (_profileId, _draft) =>
      new Promise<TextLibraryItem>((resolve) => {
        resolveCreate = resolve;
      });

    const { client, rerender } = renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={notify}
        profileId="default"
      />,
    );

    await screen.findByText("alpha");
    await user.click(screen.getByRole("button", { name: "New Item" }));
    await user.type(screen.getByLabelText("Name"), "gamma");
    await user.type(screen.getByLabelText("Content"), "Gamma content");
    await user.click(screen.getByRole("button", { name: "Create Item" }));

    rerender(
      <QueryClientProvider client={client}>
        <TextLibraryPage
          api={api}
          definition={createDefinition()}
          notify={notify}
          profileId="blue"
        />
      </QueryClientProvider>,
    );

    resolveCreate!({
      cardBadges: [{ text: "skill", className: "badge badge--accent" }],
      content: "Gamma content",
      detailBadges: [{ text: "skill", className: "badge badge--accent" }],
      id: "gamma",
      path: "profiles/default/gamma.md",
      summary: "Gamma summary",
    });

    expect(await screen.findByText("blue-item")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "gamma" })).not.toBeInTheDocument();
    expect(notify).not.toHaveBeenCalledWith("Item created.", "success");
  });

  it("does not fetch while inactive and starts fetching once the route becomes active", async () => {
    const { api } = createApi();
    const { client, rerender } = renderWithClient(
      <TextLibraryPage
        active={false}
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    expect(api.list).not.toHaveBeenCalled();

    rerender(
      <QueryClientProvider client={client}>
        <TextLibraryPage
          active
          api={api}
          definition={createDefinition()}
          notify={vi.fn()}
          profileId="default"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("clears stale cards after a failed refetch on profile switch", async () => {
    const api = {
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            cardBadges: [{ text: "skill", className: "badge badge--accent" }],
            content: "Alpha content",
            detailBadges: [{ text: "skill", className: "badge badge--accent" }],
            id: "alpha",
            path: "profiles/default/alpha.md",
            summary: "Alpha summary",
          },
        ])
        .mockRejectedValueOnce(new Error("profile exploded")),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const { client, rerender } = renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    expect(await screen.findByText("alpha")).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={client}>
        <TextLibraryPage
          api={api}
          definition={createDefinition()}
          notify={vi.fn()}
          profileId="blue"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("profile exploded")).toBeInTheDocument();
    expect(screen.getByText("No Items")).toBeInTheDocument();
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
  });

  it("keeps the previous list visible when a same-profile refetch fails", async () => {
    const api = {
      list: vi
        .fn()
        .mockResolvedValueOnce([
          {
            cardBadges: [{ text: "skill", className: "badge badge--accent" }],
            content: "Alpha content",
            detailBadges: [{ text: "skill", className: "badge badge--accent" }],
            id: "alpha",
            path: "profiles/default/alpha.md",
            summary: "Alpha summary",
          },
        ])
        .mockRejectedValueOnce(new Error("refresh exploded")),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    const ref = createRef<TextLibraryPageHandle>();

    renderWithClient(
      <TextLibraryPage
        ref={ref}
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    expect(await screen.findByText("alpha")).toBeInTheDocument();

    await act(async () => {
      await ref.current?.refresh();
    });

    expect(await screen.findByText("refresh exploded")).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("No Items")).not.toBeInTheDocument();
  });

  it("keeps the visible cards mounted during a same-profile background refresh", async () => {
    const listRequest = deferred<TextLibraryItem[]>();
    const { api } = createApi();
    const ref = createRef<TextLibraryPageHandle>();

    renderWithClient(
      <TextLibraryPage
        ref={ref}
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    expect(await screen.findByText("alpha")).toBeInTheDocument();

    api.list.mockImplementationOnce(() => listRequest.promise);

    await act(async () => {
      void ref.current?.refresh();
      await Promise.resolve();
    });

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("Loading items…")).not.toBeInTheDocument();

    listRequest.resolve([
      {
        cardBadges: [{ text: "skill", className: "badge badge--accent" }],
        content: "Alpha content",
        detailBadges: [{ text: "skill", className: "badge badge--accent" }],
        id: "alpha",
        path: "profiles/default/alpha.md",
        summary: "Alpha summary",
      },
    ]);

    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2);
    });
  });

  it("trims id fields before validation and mutation calls", async () => {
    const user = userEvent.setup();
    const { api } = createApi();

    renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    await screen.findByText("alpha");
    await user.click(screen.getByRole("button", { name: "New Item" }));
    await user.type(screen.getByLabelText("Name"), "  beta  ");
    await user.type(screen.getByLabelText("Content"), "Beta content");
    await user.click(screen.getByRole("button", { name: "Create Item" }));

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith("default", {
        content: "Beta content",
        id: "beta",
      });
    });
  });

  it("refetches detail when reopening the same cached item", async () => {
    const user = userEvent.setup();
    const { api, store } = createApi();

    renderWithClient(
      <TextLibraryPage
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    await screen.findByText("alpha");
    await user.click(screen.getByRole("button", { name: /alpha/i }));
    expect(await screen.findByText("Alpha content")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close panel" }));
    await screen.findByText("Select an item.");

    store.set("default", [
      {
        cardBadges: [{ text: "skill", className: "badge badge--accent" }],
        content: "Fresh alpha content",
        detailBadges: [{ text: "skill", className: "badge badge--accent" }],
        id: "alpha",
        path: "profiles/default/alpha.md",
        summary: "Alpha summary",
      },
    ]);

    await user.click(screen.getByRole("button", { name: /alpha/i }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Fresh alpha content")).toBeInTheDocument();
  });

  it("exposes a refresh handle that refetches the list and the selected item", async () => {
    const { api } = createApi();
    const ref = createRef<TextLibraryPageHandle>();

    renderWithClient(
      <TextLibraryPage
        ref={ref}
        api={api}
        definition={createDefinition()}
        notify={vi.fn()}
        profileId="default"
      />,
    );

    await screen.findByText("alpha");
    await userEvent.setup().click(screen.getByRole("button", { name: /alpha/i }));
    await screen.findByText("Alpha content");

    await act(async () => {
      await ref.current?.refresh();
    });

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
