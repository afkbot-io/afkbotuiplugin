import { useEffect, useMemo, useRef, useState } from "react";

import type { TextLibraryDefinition, TextLibraryDraft, TextLibraryItem } from "@/features/text-library/model/text-library.types";

type PanelState = {
  draft: TextLibraryDraft;
  error: string;
  itemId: string;
  mode: "view" | "edit";
  open: boolean;
};

type CreateModalState = {
  draft: TextLibraryDraft;
  error: string;
  open: boolean;
};

type DeleteModalState = {
  error: string;
  item: TextLibraryItem | null;
  open: boolean;
};

function buildPanelState(definition: TextLibraryDefinition): PanelState {
  return {
    draft: definition.defaultDraft(),
    error: "",
    itemId: "",
    mode: "view",
    open: false,
  };
}

function buildCreateModalState(definition: TextLibraryDefinition): CreateModalState {
  return {
    draft: definition.defaultDraft(),
    error: "",
    open: false,
  };
}

function buildDeleteModalState(): DeleteModalState {
  return {
    error: "",
    item: null,
    open: false,
  };
}

export function useTextLibraryPageState({
  definition,
  profileId,
}: {
  definition: TextLibraryDefinition;
  profileId: string;
}) {
  const [queryDraft, setQueryDraft] = useState("");
  const [queryApplied, setQueryApplied] = useState("");
  const [panel, setPanel] = useState<PanelState>(() => buildPanelState(definition));
  const [createModal, setCreateModal] = useState<CreateModalState>(() => buildCreateModalState(definition));
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(() => buildDeleteModalState());
  const previousProfileId = useRef(profileId);

  useEffect(() => {
    if (previousProfileId.current === profileId) {
      return;
    }
    previousProfileId.current = profileId;
    setPanel(buildPanelState(definition));
    setCreateModal(buildCreateModalState(definition));
    setDeleteModal(buildDeleteModalState());
  }, [definition, profileId]);

  return useMemo(
    () => ({
      applyQuery() {
        setQueryApplied(queryDraft.trim());
      },
      closeCreateModal() {
        setCreateModal(buildCreateModalState(definition));
      },
      closeDeleteModal() {
        setDeleteModal(buildDeleteModalState());
      },
      closePanel() {
        setPanel(buildPanelState(definition));
      },
      createModal,
      deleteModal,
      openCreateModal() {
        setCreateModal({
          draft: definition.defaultDraft(),
          error: "",
          open: true,
        });
      },
      openDeleteModal(item: TextLibraryItem) {
        setDeleteModal({
          error: "",
          item,
          open: true,
        });
      },
      openPanel(itemId: string) {
        setPanel({
          draft: definition.defaultDraft(),
          error: "",
          itemId,
          mode: "view",
          open: true,
        });
      },
      panel,
      queryApplied,
      queryDraft,
      setCreateDraft(nextDraft: TextLibraryDraft) {
        setCreateModal((current) => ({
          ...current,
          draft: nextDraft,
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
      setPanelDraft(nextDraft: TextLibraryDraft) {
        setPanel((current) => ({
          ...current,
          draft: nextDraft,
        }));
      },
      setPanelError(error: string) {
        setPanel((current) => ({
          ...current,
          error,
        }));
      },
      setQueryDraft,
      startEdit(item: TextLibraryItem) {
        setPanel((current) => ({
          ...current,
          draft: definition.draftFromItem(item),
          error: "",
          mode: "edit",
        }));
      },
      stopEdit() {
        setPanel((current) => ({
          ...current,
          draft: definition.defaultDraft(),
          error: "",
          mode: "view",
        }));
      },
      syncPanelItem(item: TextLibraryItem) {
        setPanel((current) => ({
          ...current,
          draft: current.mode === "edit" ? current.draft : definition.defaultDraft(),
          error: "",
          itemId: item.id,
          mode: "view",
          open: true,
        }));
      },
    }),
    [createModal, definition, deleteModal, panel, queryApplied, queryDraft],
  );
}
