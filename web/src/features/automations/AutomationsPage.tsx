import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import { useAutomationDetail } from "@/features/automations/hooks/use-automation-detail";
import { useAutomationGraphPreview } from "@/features/automations/hooks/use-automation-graph-preview";
import { useAutomationMutations } from "@/features/automations/hooks/use-automation-mutations";
import { useAutomationPageState } from "@/features/automations/hooks/use-automation-page-state";
import { useAutomationPolling } from "@/features/automations/hooks/use-automation-polling";
import { useAutomationsList } from "@/features/automations/hooks/use-automations-list";
import {
  browserTimeZone,
} from "@/shared/lib/time";
import { normalizeError } from "@/shared/lib/workspace";
import {
  validateAutomationDraft,
} from "@/features/automations/model/automations.api";
import { shouldHideMutationActions } from "@/features/automations/model/automations.presentation";
import { AutomationCreateModal } from "@/features/automations/ui/AutomationCreateModal";
import { AutomationDeleteModal } from "@/features/automations/ui/AutomationDeleteModal";
import { AutomationInspector } from "@/features/automations/ui/AutomationInspector";
import { AutomationsFilters } from "@/features/automations/ui/AutomationsFilters";
import { AutomationsGrid } from "@/features/automations/ui/AutomationsGrid";
import { AutomationsHeader } from "@/features/automations/ui/AutomationsHeader";

export const AutomationsPage = forwardRef<RouteHandle, AppRouteProps>(function AutomationsPage(
  {
    active = true,
    api,
    config,
    notify,
    profileId,
  },
  ref,
) {
  const timezoneName = browserTimeZone();
  const state = useAutomationPageState({
    profileId,
    timezoneName,
  });
  const profileIdRef = useRef(profileId);
  const previousActiveRef = useRef(active);

  useEffect(() => {
    profileIdRef.current = profileId;
  }, [profileId]);

  const listQuery = useAutomationsList({
    active,
    api,
    filters: state.filters,
    profileId,
  });
  const items = listQuery.data?.automations || [];
  const filteredCount = listQuery.data?.filteredCount ?? items.length;
  const selectedListItem = useMemo(
    () => items.find((item) => item.id === state.panel.itemId) || null,
    [items, state.panel.itemId],
  );
  const detailQuery = useAutomationDetail({
    active,
    api,
    automationId: state.panel.itemId,
    enabled: state.panel.open && state.panel.mode !== "edit",
    profileId,
  });
  const automation = detailQuery.data || selectedListItem;
  const graphQuery = useAutomationGraphPreview({
    active,
    api,
    automationId: automation?.id ?? null,
    enabled: Boolean(
      state.panel.open &&
        state.panel.graphOpen &&
        state.panel.mode !== "edit" &&
        automation?.execution_mode === "graph",
    ),
    profileId,
  });
  const mutations = useAutomationMutations({
    api,
    profileId,
  });

  const refreshAll = useCallback(async () => {
    await listQuery.refetch();
    if (state.panel.open && state.panel.itemId && state.panel.mode !== "edit") {
      await detailQuery.refetch();
      if (state.panel.graphOpen && automation?.execution_mode === "graph") {
        await graphQuery.refetch();
      }
    }
  }, [automation?.execution_mode, detailQuery, graphQuery, listQuery, state.panel.graphOpen, state.panel.itemId, state.panel.mode, state.panel.open]);

  useEffect(() => {
    if (!previousActiveRef.current && active) {
      void refreshAll();
    }
    previousActiveRef.current = active;
  }, [active, refreshAll]);

  useEffect(() => {
    if (
      state.panel.open &&
      state.panel.itemId &&
      !selectedListItem &&
      !detailQuery.data &&
      !detailQuery.isFetching &&
      !listQuery.isFetching &&
      !listQuery.error
    ) {
      state.closePanel();
    }
  }, [detailQuery.data, detailQuery.isFetching, listQuery.error, listQuery.isFetching, selectedListItem, state]);

  useEffect(() => {
    if (automation?.execution_mode !== "graph" && state.panel.graphOpen) {
      state.toggleGraph();
    }
  }, [automation?.execution_mode, state]);

  useImperativeHandle(
    ref,
    () => ({
      refresh: refreshAll,
    }),
    [refreshAll],
  );

  useAutomationPolling({
    active,
    enabled: Boolean(
      Number(config.poll_interval_sec || 0) > 0 &&
        !mutations.createMutation.isPending &&
        !mutations.updateMutation.isPending &&
        !mutations.deleteMutation.isPending &&
        !mutations.rotateWebhookMutation.isPending &&
        !state.createModal.open &&
        !state.deleteModal.open &&
        state.panel.mode !== "edit",
    ),
    intervalMs: Number(config.poll_interval_sec || 0) * 1000,
    onPoll: refreshAll,
  });

  const pageError = listQuery.error && !listQuery.isFetching ? normalizeError(listQuery.error) : "";
  const inspectorError = state.panel.error || (detailQuery.error ? normalizeError(detailQuery.error) : "");
  const graphError = graphQuery.error ? normalizeError(graphQuery.error) : "";
  const saving =
    mutations.updateMutation.isPending || mutations.deleteMutation.isPending || mutations.rotateWebhookMutation.isPending;

  const handleCopy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        notify("Copied to clipboard.", "success");
      } catch {
        notify("Clipboard write failed.", "danger");
      }
    },
    [notify],
  );

  const handleOpenPanel = useCallback((automationId: number) => {
    state.openPanel(automationId);
  }, [state]);

  const handleStartEdit = useCallback(() => {
    if (!automation) {
      return;
    }
    if (shouldHideMutationActions(automation)) {
      notify("Deleted automations are view-only.", "info");
      return;
    }
    state.startEdit(automation);
  }, [automation, notify, state]);

  const handleCreateSubmit = useCallback(async () => {
    const requestProfileId = profileId;
    const error = validateAutomationDraft(state.createModal.draft);
    if (error) {
      state.setCreateError(error);
      return;
    }

    state.setCreateError("");
    try {
      const nextAutomation = await mutations.createMutation.mutateAsync(state.createModal.draft);
      if (requestProfileId !== profileIdRef.current || !nextAutomation) {
        return;
      }
      state.closeCreateModal();
      state.syncPanelAutomation(nextAutomation);
      notify("Automation created.", "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setCreateError(mutations.resolveErrorMessage(error));
    }
  }, [mutations, notify, profileId, refreshAll, state]);

  const handleUpdateSubmit = useCallback(async () => {
    if (!automation) {
      return;
    }

    const requestProfileId = profileId;
    const error = validateAutomationDraft(state.panel.draft);
    if (error) {
      state.setPanelError(error);
      return;
    }

    state.setPanelError("");
    try {
      const nextAutomation = await mutations.updateMutation.mutateAsync({
        automationId: automation.id,
        draft: state.panel.draft,
      });
      if (requestProfileId !== profileIdRef.current || !nextAutomation) {
        return;
      }
      state.syncPanelAutomation(nextAutomation);
      notify("Automation updated.", "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setPanelError(mutations.resolveErrorMessage(error));
    }
  }, [automation, mutations, notify, profileId, refreshAll, state]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!automation) {
      return;
    }

    const requestProfileId = profileId;
    state.setDeleteError("");
    try {
      await mutations.deleteMutation.mutateAsync(automation.id);
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.closeDeleteModal();
      state.closePanel();
      notify("Automation deleted.", "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setDeleteError(mutations.resolveErrorMessage(error));
    }
  }, [automation, listQuery, mutations, notify, profileId, state]);

  const handleRotateWebhook = useCallback(async () => {
    if (!automation) {
      return;
    }

    const requestProfileId = profileId;
    state.setPanelError("");
    try {
      const nextAutomation = await mutations.rotateWebhookMutation.mutateAsync(automation.id);
      if (requestProfileId !== profileIdRef.current || !nextAutomation) {
        return;
      }
      state.syncPanelAutomation(nextAutomation);
      notify("Webhook URL rotated. Copy the refreshed endpoint now.", "success");
    } catch (error) {
      if (requestProfileId !== profileIdRef.current) {
        return;
      }
      state.setPanelError(mutations.resolveErrorMessage(error));
    }
  }, [automation, mutations, notify, profileId, state]);

  return (
    <section className="route-page">
      <AutomationsHeader onCreate={state.openCreateModal} />
      <AutomationsFilters
        filteredCount={filteredCount}
        filters={state.filters}
        onFilterChange={(key, value) => {
          state.setFilter(key, value);
        }}
        onQueryChange={state.setQueryDraft}
        onSubmit={state.applyQuery}
        query={state.queryDraft}
        visibleCount={items.length}
      />
      {pageError ? <div className="inline-alert inline-alert--danger">{pageError}</div> : null}
      <div className={`workspace${state.panel.open ? " workspace--inspecting" : ""}`}>
        <div className="board-stage">
          <AutomationsGrid
            items={items}
            loading={Boolean(listQuery.isFetching && !items.length)}
            onOpen={handleOpenPanel}
            refreshing={Boolean(listQuery.isFetching && items.length)}
            selectedId={state.panel.itemId}
          />
        </div>
        <aside className={`task-panel${state.panel.open ? " task-panel--open" : ""}`}>
          <AutomationInspector
            automation={automation || null}
            detailLoading={Boolean(detailQuery.isFetching && !automation)}
            draft={state.panel.draft}
            error={inspectorError}
            graphError={graphError}
            graphLoading={Boolean(graphQuery.isFetching && !graphQuery.data)}
            graphOpen={state.panel.graphOpen}
            graphPreview={graphQuery.data}
            mode={state.panel.mode}
            onClose={state.closePanel}
            onCopy={(value) => void handleCopy(value)}
            onDelete={state.openDeleteModal}
            onDraftChange={state.setPanelDraft}
            onEdit={handleStartEdit}
            onGraphRefresh={() => void graphQuery.refetch()}
            onGraphToggle={state.toggleGraph}
            onRotateWebhookToken={() => void handleRotateWebhook()}
            onSave={() => void handleUpdateSubmit()}
            onStartDelete={state.openDeleteModal}
            onStopEdit={state.stopEdit}
            rotatingToken={mutations.rotateWebhookMutation.isPending}
            saving={saving}
          />
        </aside>
      </div>
      <AutomationCreateModal
        draft={state.createModal.draft}
        error={state.createModal.error}
        onCancel={state.closeCreateModal}
        onDraftChange={state.setCreateDraft}
        onSubmit={() => void handleCreateSubmit()}
        open={state.createModal.open}
        saving={mutations.createMutation.isPending}
      />
      <AutomationDeleteModal
        automation={automation || null}
        error={state.deleteModal.error}
        onCancel={state.closeDeleteModal}
        onConfirm={() => void handleDeleteConfirm()}
        open={state.deleteModal.open}
        saving={mutations.deleteMutation.isPending}
      />
    </section>
  );
});
