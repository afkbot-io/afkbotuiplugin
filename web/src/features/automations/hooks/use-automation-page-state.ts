import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildAutomationDraft,
  defaultAutomationFilters,
  draftFromAutomation,
} from "@/features/automations/model/automations.api";
import type { Automation, AutomationDraft, AutomationFilters } from "@/features/automations/model/automations.types";

type PanelState = {
  draft: AutomationDraft;
  error: string;
  graphOpen: boolean;
  itemId: number | null;
  mode: "view" | "edit";
  open: boolean;
};

type CreateModalState = {
  draft: AutomationDraft;
  error: string;
  open: boolean;
};

type DeleteModalState = {
  error: string;
  open: boolean;
};

function buildPanelState(timezoneName: string): PanelState {
  return {
    draft: buildAutomationDraft(timezoneName),
    error: "",
    graphOpen: false,
    itemId: null,
    mode: "view",
    open: false,
  };
}

function buildCreateModalState(timezoneName: string): CreateModalState {
  return {
    draft: buildAutomationDraft(timezoneName),
    error: "",
    open: false,
  };
}

function buildDeleteModalState(): DeleteModalState {
  return {
    error: "",
    open: false,
  };
}

export function useAutomationPageState({
  profileId,
  timezoneName,
}: {
  profileId: string;
  timezoneName: string;
}) {
  const [filters, setFilters] = useState<AutomationFilters>(defaultAutomationFilters);
  const [queryDraft, setQueryDraft] = useState(defaultAutomationFilters.query);
  const [panel, setPanel] = useState<PanelState>(() => buildPanelState(timezoneName));
  const [createModal, setCreateModal] = useState<CreateModalState>(() => buildCreateModalState(timezoneName));
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(() => buildDeleteModalState());
  const previousProfileId = useRef(profileId);

  useEffect(() => {
    if (previousProfileId.current === profileId) {
      return;
    }
    previousProfileId.current = profileId;
    setPanel(buildPanelState(timezoneName));
    setCreateModal(buildCreateModalState(timezoneName));
    setDeleteModal(buildDeleteModalState());
  }, [profileId, timezoneName]);

  return useMemo(
    () => ({
      applyQuery() {
        setFilters((current) => ({
          ...current,
          query: queryDraft.trim(),
        }));
      },
      closeCreateModal() {
        setCreateModal(buildCreateModalState(timezoneName));
      },
      closeDeleteModal() {
        setDeleteModal(buildDeleteModalState());
      },
      closePanel() {
        setPanel(buildPanelState(timezoneName));
      },
      createModal,
      deleteModal,
      filters,
      openCreateModal() {
        setCreateModal({
          draft: buildAutomationDraft(timezoneName),
          error: "",
          open: true,
        });
      },
      openDeleteModal() {
        setDeleteModal({
          error: "",
          open: true,
        });
      },
      openPanel(itemId: number) {
        setPanel({
          draft: buildAutomationDraft(timezoneName),
          error: "",
          graphOpen: false,
          itemId,
          mode: "view",
          open: true,
        });
      },
      panel,
      queryDraft,
      setCreateDraft(draft: AutomationDraft) {
        setCreateModal((current) => ({
          ...current,
          draft,
        }));
      },
      setCreateError(error: string) {
        setCreateModal((current) => ({
          ...current,
          error,
        }));
      },
      setDeleteError(error: string) {
        setDeleteModal((current) => ({
          ...current,
          error,
        }));
      },
      setFilter<K extends keyof AutomationFilters>(key: K, value: AutomationFilters[K]) {
        setFilters((current) => ({
          ...current,
          [key]: value,
        }));
      },
      setPanelDraft(draft: AutomationDraft) {
        setPanel((current) => ({
          ...current,
          draft,
        }));
      },
      setPanelError(error: string) {
        setPanel((current) => ({
          ...current,
          error,
        }));
      },
      setQueryDraft,
      startEdit(automation: Automation) {
        setPanel((current) => ({
          ...current,
          draft: draftFromAutomation(automation, timezoneName),
          error: "",
          mode: "edit",
        }));
      },
      stopEdit() {
        setPanel((current) => ({
          ...current,
          error: "",
          mode: "view",
        }));
      },
      syncPanelAutomation(automation: Automation) {
        setPanel((current) => ({
          ...current,
          error: "",
          graphOpen: automation.execution_mode === "graph" ? current.graphOpen : false,
          itemId: automation.id,
          mode: "view",
          open: true,
        }));
      },
      syncPanelFromList(automation: Automation | null) {
        if (!automation) {
          return;
        }
        setPanel((current) => ({
          ...current,
          itemId: automation.id,
        }));
      },
      toggleGraph() {
        setPanel((current) => ({
          ...current,
          graphOpen: !current.graphOpen,
        }));
      },
    }),
    [createModal, deleteModal, filters, panel, queryDraft, timezoneName],
  );
}
