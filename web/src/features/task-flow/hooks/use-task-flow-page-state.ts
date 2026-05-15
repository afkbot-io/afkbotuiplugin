import { useEffect, useMemo, useRef, useState } from "react";

import {
  defaultProjectDraft,
  defaultReviewDraft,
  defaultTaskDraft,
  settingsDraftFromConfig,
  taskDraftFromTask,
} from "@/features/task-flow/model/task-flow.api";
import type {
  TaskFlowConfig,
  TaskFlowProfile,
  TaskFlowProject,
  TaskFlowProjectDraft,
  TaskFlowReviewDraft,
  TaskFlowTask,
  TaskFlowTaskDraft,
} from "@/features/task-flow/model/task-flow.types";

type ModalState = "" | "agent-feed" | "delete-selected" | "delete-task" | "manage-projects" | "review" | "settings" | "task";

type CreateProjectState = {
  draft: TaskFlowProjectDraft;
  error: string;
};

type CreateTaskState = {
  draft: TaskFlowTaskDraft;
  error: string;
};

type SettingsState = {
  draft: ReturnType<typeof settingsDraftFromConfig>;
  error: string;
};

type DeleteState = {
  error: string;
  pendingProjectId: string;
};

type ReviewState = {
  draft: TaskFlowReviewDraft;
  error: string;
};

export function useTaskFlowPageState({
  config,
  profileId,
  profiles,
}: {
  config: TaskFlowConfig;
  profileId: string;
  profiles: TaskFlowProfile[];
}) {
  const [flowFilter, setFlowFilter] = useState("");
  const [flowSearchQuery, setFlowSearchQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());
  const [sessionFeedOpen, setSessionFeedOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalState>("");
  const [modalBusy, setModalBusy] = useState(false);
  const [createProject, setCreateProject] = useState<CreateProjectState>(() => ({
    draft: defaultProjectDraft(profiles),
    error: "",
  }));
  const [createTask, setCreateTask] = useState<CreateTaskState>(() => ({
    draft: defaultTaskDraft(config, profiles),
    error: "",
  }));
  const [settings, setSettings] = useState<SettingsState>(() => ({
    draft: settingsDraftFromConfig(config),
    error: "",
  }));
  const [deleteState, setDeleteState] = useState<DeleteState>({
    error: "",
    pendingProjectId: "",
  });
  const [review, setReview] = useState<ReviewState>({
    draft: defaultReviewDraft(),
    error: "",
  });
  const previousProfileIdRef = useRef(profileId);
  const previousSelectedTaskIdRef = useRef(selectedTaskId);

  useEffect(() => {
    if (previousProfileIdRef.current === profileId) {
      return;
    }
    previousProfileIdRef.current = profileId;
    setFlowFilter("");
    setFlowSearchQuery("");
    setSelectedTaskId("");
    setSelectedTaskIds(new Set());
    setSessionFeedOpen(false);
    setActiveModal("");
    setModalBusy(false);
    setCreateProject({ draft: defaultProjectDraft(profiles), error: "" });
    setCreateTask({ draft: defaultTaskDraft(config, profiles), error: "" });
    setSettings({ draft: settingsDraftFromConfig(config), error: "" });
    setDeleteState({ error: "", pendingProjectId: "" });
    setReview({ draft: defaultReviewDraft(), error: "" });
  }, [config, profileId, profiles]);

  useEffect(() => {
    setSettings({ draft: settingsDraftFromConfig(config), error: "" });
  }, [config]);

  useEffect(() => {
    if (!previousSelectedTaskIdRef.current) {
      previousSelectedTaskIdRef.current = selectedTaskId;
      return;
    }
    if (previousSelectedTaskIdRef.current !== selectedTaskId) {
      setSessionFeedOpen(false);
    }
    previousSelectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  return useMemo(
    () => ({
      activeModal,
      clearSelection() {
        setSelectedTaskIds(new Set());
      },
      closeModal() {
        setActiveModal("");
        setModalBusy(false);
        setDeleteState({ error: "", pendingProjectId: "" });
        setReview({ draft: defaultReviewDraft(), error: "" });
      },
      clearPendingProjectDelete() {
        setDeleteState((current) => ({
          ...current,
          error: "",
          pendingProjectId: "",
        }));
      },
      createProject,
      createTask,
      deleteState,
      flowFilter,
      flowSearchQuery,
      modalBusy,
      openDeleteSelectedModal() {
        setActiveModal("delete-selected");
        setDeleteState((current) => ({ ...current, error: "" }));
      },
      openAgentFeedModal() {
        setActiveModal("agent-feed");
      },
      openDeleteTaskModal() {
        setActiveModal("delete-task");
        setDeleteState((current) => ({ ...current, error: "" }));
      },
      openManageProjectsModal() {
        setActiveModal("manage-projects");
        setDeleteState((current) => ({ ...current, error: "" }));
      },
      openReviewModal() {
        setActiveModal("review");
        setReview({ draft: defaultReviewDraft(), error: "" });
      },
      openSettingsModal() {
        setActiveModal("settings");
        setSettings({ draft: settingsDraftFromConfig(config), error: "" });
      },
      openSessionFeed() {
        setSessionFeedOpen(true);
      },
      openTaskModal(currentFlowId: string) {
        setActiveModal("task");
        setCreateTask({
          draft: defaultTaskDraft(config, profiles, currentFlowId),
          error: "",
        });
      },
      requestProjectDelete(projectId: string) {
        setDeleteState((current) => ({
          ...current,
          error: "",
          pendingProjectId: projectId,
        }));
      },
      review,
      selectedTaskId,
      selectedTaskIds,
      selectTask(taskId: string) {
        setSelectedTaskId(taskId);
      },
      setCreateProjectDraft(draft: TaskFlowProjectDraft) {
        setCreateProject((current) => ({ ...current, draft }));
      },
      setCreateProjectError(error: string) {
        setCreateProject((current) => ({ ...current, error }));
      },
      setCreateTaskDraft(draft: TaskFlowTaskDraft) {
        setCreateTask((current) => ({ ...current, draft }));
      },
      setCreateTaskError(error: string) {
        setCreateTask((current) => ({ ...current, error }));
      },
      setDeleteError(error: string) {
        setDeleteState((current) => ({ ...current, error }));
      },
      setFlowFilter,
      setFlowSearchQuery,
      setModalBusy,
      closeSessionFeed() {
        setSessionFeedOpen(false);
      },
      setReviewDraft(draft: TaskFlowReviewDraft) {
        setReview((current) => ({ ...current, draft }));
      },
      setReviewError(error: string) {
        setReview((current) => ({ ...current, error }));
      },
      setSelectedTaskIds(nextTaskIds: Set<string>) {
        setSelectedTaskIds(nextTaskIds);
      },
      setSessionFeedOpen,
      setSettingsDraft(draft: SettingsState["draft"]) {
        setSettings((current) => ({ ...current, draft }));
      },
      setSettingsError(error: string) {
        setSettings((current) => ({ ...current, error }));
      },
      settings,
      sessionFeedOpen,
      startTaskEdit(task: TaskFlowTask) {
        setCreateTask({
          draft: taskDraftFromTask(task),
          error: "",
        });
      },
      syncSelectedTask(task: TaskFlowTask | null) {
        if (!task) {
          return;
        }
        setSelectedTaskId(task.id);
      },
      toggleSessionFeed() {
        setSessionFeedOpen((current) => !current);
      },
      toggleTaskSelection(taskId: string, checked: boolean) {
        setSelectedTaskIds((current) => {
          const next = new Set(current);
          if (checked) {
            next.add(taskId);
          } else {
            next.delete(taskId);
          }
          return next;
        });
      },
    }),
    [
      activeModal,
      config,
      createProject,
      createTask,
      deleteState,
      flowFilter,
      flowSearchQuery,
      modalBusy,
      profiles,
      review,
      selectedTaskId,
      selectedTaskIds,
      sessionFeedOpen,
      settings,
    ],
  );
}
