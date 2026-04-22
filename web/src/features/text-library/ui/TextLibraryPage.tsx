import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

import { resolveTextLibraryErrorMessage } from "@/features/text-library/model/text-library.errors";
import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";
import { useTextLibraryItem } from "@/features/text-library/hooks/use-text-library-item";
import { useTextLibraryList } from "@/features/text-library/hooks/use-text-library-list";
import { useTextLibraryMutations } from "@/features/text-library/hooks/use-text-library-mutations";
import { useTextLibraryPageState } from "@/features/text-library/hooks/use-text-library-page-state";
import { TextLibraryCreateModal } from "@/features/text-library/ui/TextLibraryCreateModal";
import { TextLibraryDeleteModal } from "@/features/text-library/ui/TextLibraryDeleteModal";
import { TextLibraryGrid } from "@/features/text-library/ui/TextLibraryGrid";
import { TextLibraryHeader } from "@/features/text-library/ui/TextLibraryHeader";
import { TextLibraryInspector } from "@/features/text-library/ui/TextLibraryInspector";
import { TextLibraryToolbar } from "@/features/text-library/ui/TextLibraryToolbar";
import { captureSurfaceState, restoreSurfaceState } from "@/shared/lib/surface-state";

export type TextLibraryPageHandle = {
  refresh: () => Promise<void>;
};

type TextLibraryPageProps = {
  active?: boolean;
  api: unknown;
  definition: TextLibraryDefinition;
  notify: (message: string, kind?: string) => void;
  onReadyChange?: (ready: boolean) => void;
  profileId: string;
};

export const TextLibraryPage = forwardRef<TextLibraryPageHandle, TextLibraryPageProps>(function TextLibraryPage(
  {
    active = true,
    api,
    definition,
    notify,
    onReadyChange,
    profileId,
  },
  ref,
) {
  const state = useTextLibraryPageState({
    definition,
    profileId,
  });
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const profileIdRef = useRef(profileId);
  const previousActiveRef = useRef(active);
  const previousPanelRef = useRef({
    itemId: "",
    open: false,
  });
  const inspectorNodeRef = useRef<HTMLElement | null>(null);
  const inspectorSnapshotRef = useRef<ReturnType<typeof captureSurfaceState> | null>(null);

  useEffect(() => {
    profileIdRef.current = profileId;
  }, [profileId]);

  const listQuery = useTextLibraryList({
    active,
    api,
    definition,
    profileId,
    query: state.queryApplied,
  });
  const items = listQuery.data || [];
  const selectedListItem = useMemo(
    () => items.find((item) => item.id === state.panel.itemId) || null,
    [items, state.panel.itemId],
  );
  const detailQuery = useTextLibraryItem({
    active,
    api,
    definition,
    itemId: state.panel.itemId,
    profileId,
  });
  const mutations = useTextLibraryMutations({
    api,
    definition,
    profileId,
  });

  const inspectorItem = detailQuery.data || selectedListItem;
  const inspectorError =
    state.panel.error ||
    (detailQuery.error
      ? resolveTextLibraryErrorMessage(detailQuery.error, definition.ui.profileMissingDescription?.(profileId))
      : "");
  const pageError =
    listQuery.error && !listQuery.isFetching
      ? resolveTextLibraryErrorMessage(listQuery.error, definition.ui.profileMissingDescription?.(profileId))
      : "";

  useEffect(() => {
    if (!active) {
      return;
    }
    onReadyChange?.(!listQuery.isLoading);
  }, [active, listQuery.isLoading, onReadyChange]);

  useEffect(() => {
    if (!previousActiveRef.current && active) {
      void listQuery.refetch();
      if (state.panel.open && state.panel.itemId) {
        void detailQuery.refetch();
      }
    }
    previousActiveRef.current = active;
  }, [active, detailQuery, listQuery, state.panel.itemId, state.panel.open]);

  useEffect(() => {
    const reopenedInspector =
      active &&
      state.panel.open &&
      Boolean(state.panel.itemId) &&
      (!previousPanelRef.current.open || previousPanelRef.current.itemId !== state.panel.itemId);

    if (reopenedInspector && detailQuery.data) {
      void detailQuery.refetch();
    }

    previousPanelRef.current = {
      itemId: state.panel.itemId,
      open: state.panel.open,
    };
  }, [active, detailQuery, detailQuery.data, state.panel.itemId, state.panel.open]);

  useLayoutEffect(() => {
    if (!inspectorNodeRef.current || !inspectorSnapshotRef.current) {
      return;
    }
    restoreSurfaceState(inspectorNodeRef.current, inspectorSnapshotRef.current);
    inspectorSnapshotRef.current = null;
  });

  const rememberInspectorSurface = () => {
    if (!inspectorNodeRef.current) {
      return;
    }
    inspectorSnapshotRef.current = captureSurfaceState(inspectorNodeRef.current);
  };

  const normalizeDraft = (draft: { content: string; id: string }) => ({
    ...draft,
    id: draft.id.trim(),
  });

  const handleManualRefresh = async () => {
    setManualRefreshing(true);
    try {
      await listQuery.refetch();
      if (state.panel.open && state.panel.itemId) {
        await detailQuery.refetch();
      }
    } finally {
      setManualRefreshing(false);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      async refresh() {
        await listQuery.refetch();
        if (state.panel.open && state.panel.itemId) {
          await detailQuery.refetch();
        }
      },
    }),
    [detailQuery, listQuery, state.panel.itemId, state.panel.open],
  );

  const handleCreateSubmit = async () => {
    const requestProfileId = profileId;
    const normalizedDraft = normalizeDraft(state.createModal.draft);
    const error = definition.validateCreate(normalizedDraft);
    if (error) {
      state.setCreateError(error);
      return;
    }
    state.setCreateError("");
    try {
      const item = await mutations.createMutation.mutateAsync(normalizedDraft);
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.closeCreateModal();
      state.syncPanelItem(item);
      notify(definition.ui.createSuccessLabel, "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setCreateError(mutations.resolveErrorMessage(error));
    }
  };

  const handleUpdateSubmit = async () => {
    const requestProfileId = profileId;
    if (!inspectorItem) {
      return;
    }
    const normalizedDraft = normalizeDraft(state.panel.draft);
    const error = definition.validateUpdate(normalizedDraft, inspectorItem);
    if (error) {
      state.setPanelError(error);
      return;
    }
    rememberInspectorSurface();
    state.setPanelError("");
    try {
      const nextItem = await mutations.updateMutation.mutateAsync({
        draft: normalizedDraft,
        item: inspectorItem,
      });
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.syncPanelItem(nextItem);
      notify(definition.ui.updateSuccessLabel, "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setPanelError(mutations.resolveErrorMessage(error));
    }
  };

  const handleDeleteConfirm = async () => {
    const requestProfileId = profileId;
    if (!state.deleteModal.item) {
      return;
    }
    rememberInspectorSurface();
    state.setDeleteError("");
    try {
      await mutations.deleteMutation.mutateAsync(state.deleteModal.item);
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.closeDeleteModal();
      if (state.panel.itemId === state.deleteModal.item.id) {
        state.closePanel();
      }
      notify(definition.ui.deleteSuccessLabel, "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setDeleteError(mutations.resolveErrorMessage(error));
    }
  };

  return (
    <section className="route-page tl-page">
      <TextLibraryHeader
        onCreate={state.openCreateModal}
        onRefresh={handleManualRefresh}
        refreshing={manualRefreshing}
        ui={definition.ui}
      />

      <TextLibraryToolbar
        itemCount={items.length}
        onQueryChange={state.setQueryDraft}
        onSubmit={state.applyQuery}
        query={state.queryDraft}
        ui={definition.ui}
      />

      {pageError ? <div className="inline-alert inline-alert--danger">{pageError}</div> : null}

      <div className={`workspace${state.panel.open ? " workspace--inspecting" : ""}`}>
        <div className="board-stage">
          <div className={definition.gridClass}>
            <TextLibraryGrid
              cardClass={definition.cardClass}
              empty={!items.length}
              items={items}
              loading={Boolean(listQuery.isFetching && !items.length)}
              onOpen={state.openPanel}
              selectedId={state.panel.itemId}
              ui={definition.ui}
            />
          </div>
        </div>
        <aside
          className={`task-panel tl-inspector${state.panel.open ? " task-panel--open" : ""}`}
          ref={(node) => {
            inspectorNodeRef.current = node;
          }}
        >
          <TextLibraryInspector
            closeLabel={definition.ui.closePanelLabel}
            draft={state.panel.draft}
            error={state.panel.mode === "edit" ? state.panel.error : inspectorError}
            item={inspectorItem}
            idReadonly={definition.idReadonlyOnEdit}
            loading={detailQuery.isFetching}
            mode={state.panel.mode}
            onCancelEdit={() => {
              rememberInspectorSurface();
              state.stopEdit();
            }}
            onChangeDraft={state.setPanelDraft}
            onClose={state.closePanel}
            onDelete={() => inspectorItem && state.openDeleteModal(inspectorItem)}
            onEdit={() => {
              if (!inspectorItem) {
                return;
              }
              rememberInspectorSurface();
              state.startEdit(inspectorItem);
            }}
            onSubmit={handleUpdateSubmit}
            saving={mutations.updateMutation.isPending}
            contentRows={definition.contentRows.edit}
            ui={definition.ui}
          />
        </aside>
      </div>

      {state.createModal.open ? (
        <TextLibraryCreateModal
          contentRows={definition.contentRows.create}
          draft={state.createModal.draft}
          error={state.createModal.error}
          idFieldReadonly={false}
          onChangeDraft={state.setCreateDraft}
          onClose={state.closeCreateModal}
          onSubmit={handleCreateSubmit}
          saving={mutations.createMutation.isPending}
          ui={definition.ui}
        />
      ) : null}

      {state.deleteModal.open && state.deleteModal.item ? (
        <TextLibraryDeleteModal
          error={state.deleteModal.error}
          item={state.deleteModal.item}
          onClose={state.closeDeleteModal}
          onConfirm={handleDeleteConfirm}
          saving={mutations.deleteMutation.isPending}
          ui={definition.ui}
        />
      ) : null}
    </section>
  );
});
