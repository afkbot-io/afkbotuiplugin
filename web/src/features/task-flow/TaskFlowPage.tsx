import { useQuery } from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import { useTaskFlowPageState } from "@/features/task-flow/hooks/use-task-flow-page-state";
import { useTaskFlowPolling } from "@/features/task-flow/hooks/use-task-flow-polling";
import {
  approveTaskReview,
  buildSettingsPatch,
  createTaskComment,
  createTaskItem,
  createTaskProject,
  defaultTaskDraft,
  deleteTaskItem,
  deleteTaskProject,
  confirmTaskDocument,
  getTaskDetail,
  getTaskContext,
  getTaskFlowBoard,
  getTaskSessionInsights,
  getRootEmployeeOwnerError,
  getRootEmployeeOwnerOption,
  listTaskFlowReview,
  listTaskFlowEmployees,
  listTaskDocuments,
  listTaskProjects,
  normalizeTaskFlowConfig,
  resolveTaskFlowError,
  taskDraftFromTask,
  updateTaskItem,
  validateProjectDraft,
  validateSettingsDraft,
  validateTaskDraft,
  validateReviewDraft,
  bulkMoveTaskItems,
  bulkDeleteTaskItems,
  putTaskDocument,
  requestTaskReviewChanges,
  runTaskFlowKnowledgeMaintenance,
  updateTaskProject,
  withRootEmployeeOwner,
} from "@/features/task-flow/model/task-flow.api";
import {
  getTaskSessionKey,
  getRenderedTaskSession,
  shouldAutoRefreshTaskSession,
} from "@/features/task-flow/model/task-flow.presentation";
import { taskFlowQueryKeys } from "@/features/task-flow/model/task-flow.query-keys";
import type {
  TaskFlowDocument,
  TaskFlowDocumentDraft,
  TaskFlowKnowledgeMaintenanceSweep,
  TaskFlowTask,
  TaskSessionInsights,
} from "@/features/task-flow/model/task-flow.types";
import { TaskBoard } from "@/features/task-flow/ui/TaskBoard";
import { CreateTaskModal } from "@/features/task-flow/ui/CreateTaskModal";
import { DeleteSelectedTasksModal } from "@/features/task-flow/ui/DeleteSelectedTasksModal";
import { DeleteTaskModal } from "@/features/task-flow/ui/DeleteTaskModal";
import { ManageProjectsModal } from "@/features/task-flow/ui/ManageProjectsModal";
import { ReviewQueueModal } from "@/features/task-flow/ui/ReviewQueueModal";
import { TaskFlowHeader } from "@/features/task-flow/ui/TaskFlowHeader";
import { TaskFlowSettingsModal } from "@/features/task-flow/ui/TaskFlowSettingsModal";
import { TaskInspector } from "@/features/task-flow/ui/TaskInspector";
import { TaskKnowledgePanel } from "@/features/task-flow/ui/TaskKnowledgePanel";
import { TaskSessionModal } from "@/features/task-flow/ui/TaskSessionModal";

export const TaskFlowPage = forwardRef<RouteHandle, AppRouteProps>(function TaskFlowPage(
  {
    active = true,
    api,
    config,
    navigateToRoute = () => undefined,
    notify,
    profileId,
    profiles,
    updateConfig,
  },
  ref,
) {
  const taskFlowConfig = useMemo(() => normalizeTaskFlowConfig(config), [config]);
  const state = useTaskFlowPageState({
    config: taskFlowConfig,
    profileId,
    profiles,
  });
  const [editorDraft, setEditorDraft] = useState(() => defaultTaskDraft(taskFlowConfig, profiles));
  const [editorError, setEditorError] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [manualRefreshingBoard, setManualRefreshingBoard] = useState(false);
  const [runningKnowledgeMaintenance, setRunningKnowledgeMaintenance] = useState(false);
  const [knowledgeMaintenanceResult, setKnowledgeMaintenanceResult] = useState<TaskFlowKnowledgeMaintenanceSweep | null>(null);
  const [savingDocumentId, setSavingDocumentId] = useState("");
  const [refreshingSessionKeys, setRefreshingSessionKeys] = useState<Set<string>>(() => new Set());
  const [sessionInsights, setSessionInsights] = useState<TaskSessionInsights | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [editingFlowId, setEditingFlowId] = useState("");
  const sectionRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragTaskIdRef = useRef("");
  const boardPanRef = useRef({
    active: false,
    scrollLeft: 0,
    startX: 0,
  });
  const previousActiveRef = useRef(active);
  const profileIdRef = useRef(profileId);
  const selectedTaskIdRef = useRef(state.selectedTaskId);
  const sessionRefreshRef = useRef<{ key: string; promise: Promise<void> | null }>({
    key: "",
    promise: null,
  });
  const currentSessionRequestKeyRef = useRef("");

  const projectsQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey: taskFlowQueryKeys.projects(profileId),
    queryFn: () => listTaskProjects(api, profileId),
    refetchOnWindowFocus: false,
  });

  const boardQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey: taskFlowQueryKeys.board(profileId, state.flowFilter, taskFlowConfig.task_flow_board_limit_per_column),
    queryFn: () => getTaskFlowBoard(api, profileId, state.flowFilter, taskFlowConfig),
    refetchOnWindowFocus: false,
  });

  const reviewQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey: taskFlowQueryKeys.review(
      profileId,
      state.flowFilter,
      taskFlowConfig.task_flow_actor_type,
      taskFlowConfig.task_flow_actor_ref,
    ),
    queryFn: () => listTaskFlowReview(api, profileId, state.flowFilter, taskFlowConfig),
    refetchOnWindowFocus: false,
  });

  const employeesQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey: taskFlowQueryKeys.employees(profileId),
    queryFn: () => listTaskFlowEmployees(api, profileId),
    refetchOnWindowFocus: false,
  });

  const detailQuery = useQuery({
    enabled: active && Boolean(state.selectedTaskId),
    queryKey: taskFlowQueryKeys.detail(profileId, state.selectedTaskId),
    queryFn: () => getTaskDetail(api, profileId, state.selectedTaskId),
    refetchOnWindowFocus: false,
  });

  const contextQuery = useQuery({
    enabled: active && Boolean(state.selectedTaskId),
    queryKey: taskFlowQueryKeys.context(profileId, state.selectedTaskId),
    queryFn: () => getTaskContext(api, profileId, state.selectedTaskId),
    refetchOnWindowFocus: false,
  });

  const flowDocumentsQuery = useQuery({
    enabled: active && Boolean(profileId) && Boolean(state.flowFilter),
    queryKey: taskFlowQueryKeys.documents(profileId, "flow", state.flowFilter),
    queryFn: () => listTaskDocuments(api, profileId, "flow", state.flowFilter),
    refetchOnWindowFocus: false,
  });

  const board = boardQuery.data || null;
  const flows = projectsQuery.data || [];
  const reviewTasks = reviewQuery.data || [];
  const employees = employeesQuery.data || [];
  const rootEmployee = useMemo(
    () => getRootEmployeeOwnerOption(profileId, employees),
    [employees, profileId],
  );
  const rootEmployeeError = useMemo(
    () => getRootEmployeeOwnerError(profileId, employees),
    [employees, profileId],
  );
  const createTaskDraft = useMemo(
    () => withRootEmployeeOwner(state.createTask.draft, rootEmployee),
    [rootEmployee, state.createTask.draft],
  );
  const flowTitleById = useMemo(
    () => new Map(flows.map((flow) => [flow.id, flow.title || flow.id])),
    [flows],
  );
  const selectedListTask = useMemo(
    () => findBoardTask(board, state.selectedTaskId),
    [board, state.selectedTaskId],
  );
  const detail = detailQuery.data || (selectedListTask
    ? {
        task: selectedListTask,
        task_comments: [],
        task_dependencies: [],
        task_events: [],
        task_runs: [],
      }
    : null);
  const selectedTask = detail?.task || null;
  const renderedSession = getRenderedTaskSession(selectedTask, sessionInsights);
  const sessionKey = useMemo(() => getTaskSessionKey(selectedTask), [selectedTask]);
  const sessionAutoRefreshEnabled = useMemo(
    () => shouldAutoRefreshTaskSession(selectedTask, sessionInsights),
    [selectedTask, sessionInsights],
  );
  const sessionRequestKey = useMemo(() => {
    if (!selectedTask || !sessionKey) {
      return "";
    }
    return `${selectedTask.id}::${sessionKey.sessionProfileId}::${sessionKey.sessionId}`;
  }, [selectedTask, sessionKey]);
  const refreshingSession = useMemo(
    () => Boolean(sessionRequestKey && refreshingSessionKeys.has(sessionRequestKey)),
    [refreshingSessionKeys, sessionRequestKey],
  );
  profileIdRef.current = profileId;
  selectedTaskIdRef.current = state.selectedTaskId;
  currentSessionRequestKeyRef.current = sessionRequestKey;

  const refreshSession = useCallback(
    async ({ incremental = false }: { incremental?: boolean } = {}) => {
      if (!selectedTask || !sessionKey || !sessionRequestKey) {
        setSessionInsights(null);
        setSessionError("");
        sessionRefreshRef.current = { key: "", promise: null };
        return;
      }
      if (sessionRefreshRef.current.promise && sessionRefreshRef.current.key === sessionRequestKey) {
        return sessionRefreshRef.current.promise;
      }
      const selectedTaskSnapshot = selectedTask;
      const selectedSessionKey = sessionKey;
      const requestKey = sessionRequestKey;
      const sessionSnapshot = sessionInsights;
      const requestPromise = (async () => {
        try {
          const nextInsights = await getTaskSessionInsights(
            api,
            profileId,
            selectedTaskSnapshot.id,
            sessionSnapshot,
            Boolean(
              incremental &&
                sessionSnapshot &&
                selectedTaskSnapshot.id === sessionSnapshot.taskId &&
                selectedSessionKey.sessionId === sessionSnapshot.session?.session_id &&
                selectedSessionKey.sessionProfileId === String(sessionSnapshot.session?.session_profile_id || "").trim(),
            ),
          );
          if (
            profileIdRef.current !== profileId ||
            selectedTaskIdRef.current !== selectedTaskSnapshot.id ||
            currentSessionRequestKeyRef.current !== requestKey
          ) {
            return;
          }
          setSessionInsights(nextInsights);
          setSessionError("");
        } catch (error) {
          if (
            profileIdRef.current !== profileId ||
            selectedTaskIdRef.current !== selectedTaskSnapshot.id ||
            currentSessionRequestKeyRef.current !== requestKey
          ) {
            return;
          }
          setSessionError(resolveTaskFlowError(error));
        }
      })();
      sessionRefreshRef.current = {
        key: requestKey,
        promise: requestPromise.finally(() => {
          if (sessionRefreshRef.current.key === requestKey) {
            sessionRefreshRef.current = { key: "", promise: null };
          }
        }),
      };
      return sessionRefreshRef.current.promise;
    },
    [api, profileId, selectedTask, sessionInsights, sessionKey, sessionRequestKey],
  );

  useEffect(() => {
    if (!sessionRequestKey && sessionRefreshRef.current.key) {
      sessionRefreshRef.current = { key: "", promise: null };
    }
  }, [sessionRequestKey]);

  const refreshCurrentSessionIncrementally = useCallback(
    async (incremental: boolean) => {
      await refreshSession({ incremental });
    },
    [refreshSession],
  );

  const refreshCurrentSessionManually = useCallback(async () => {
    const requestKey = sessionRequestKey;
    if (requestKey) {
      setRefreshingSessionKeys((current) => {
        const next = new Set(current);
        next.add(requestKey);
        return next;
      });
    }
    try {
      await refreshSession({ incremental: false });
    } finally {
      if (requestKey) {
        setRefreshingSessionKeys((current) => {
          if (!current.has(requestKey)) {
            return current;
          }
          const next = new Set(current);
          next.delete(requestKey);
          return next;
        });
      }
    }
  }, [refreshSession, sessionRequestKey]);

  const openSessionFeed = useCallback(() => {
    state.openSessionFeed();
    void refreshCurrentSessionManually();
  }, [refreshCurrentSessionManually, state]);

  const closeSessionFeed = useCallback(() => {
    state.closeSessionFeed();
  }, [state]);

  const refreshAll = useCallback(
    async (incrementalSession = false) => {
      if (!active) {
        return;
      }
      const projectsResult = await projectsQuery.refetch();
      const nextFlows = projectsResult.data || [];
      const currentFlowFilter = String(state.flowFilter || "");
      const hasCurrentFlow = currentFlowFilter && nextFlows.some((flow) => flow.id === currentFlowFilter);
      if (currentFlowFilter && !hasCurrentFlow) {
        state.setFlowFilter("");
        state.selectTask("");
        state.setSelectedTaskIds(new Set());
        state.setSessionFeedOpen(false);
        setSessionInsights(null);
        return;
      }

      await Promise.all([boardQuery.refetch(), reviewQuery.refetch()]);
      if (state.selectedTaskId) {
        await Promise.all([detailQuery.refetch(), contextQuery.refetch()]);
        if (sessionAutoRefreshEnabled) {
          await refreshCurrentSessionIncrementally(incrementalSession);
        }
      }
    },
    [
      active,
      boardQuery,
      contextQuery,
      detailQuery,
      projectsQuery,
      refreshCurrentSessionIncrementally,
      reviewQuery,
      sessionAutoRefreshEnabled,
      state,
    ],
  );

  const refreshBoardManually = useCallback(async () => {
    setManualRefreshingBoard(true);
    try {
      await refreshAll(false);
    } finally {
      setManualRefreshingBoard(false);
    }
  }, [refreshAll]);

  const handleRunKnowledgeMaintenance = useCallback(async () => {
    setRunningKnowledgeMaintenance(true);
    try {
      const result = await runTaskFlowKnowledgeMaintenance(api, profileId, state.flowFilter, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      setKnowledgeMaintenanceResult(result);
      const created = Number(result?.created_task_count || 0);
      const woken = Number(result?.woken_task_count || 0);
      notify(
        `CTO review queued ${created} task${created === 1 ? "" : "s"} and woke ${woken}.`,
        created || woken ? "success" : "info",
      );
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current === profileId) {
        notify(resolveTaskFlowError(error), "danger");
      }
    } finally {
      setRunningKnowledgeMaintenance(false);
    }
  }, [api, notify, profileId, refreshAll, state.flowFilter, taskFlowConfig]);

  useEffect(() => {
    if (!previousActiveRef.current && active) {
      void refreshAll(false);
    }
    previousActiveRef.current = active;
  }, [active, refreshAll]);

  useEffect(() => {
    if (!selectedTask) {
      setSessionInsights(null);
      setSessionError("");
      return;
    }
    setEditorDraft(taskDraftFromTask(selectedTask));
    setEditorError("");
    setSessionError("");
  }, [selectedTask]);

  useEffect(() => {
    if (!state.selectedTaskId) {
      setSessionInsights(null);
      setSessionError("");
      state.setSessionFeedOpen(false);
    }
  }, [state, state.selectedTaskId]);

  useImperativeHandle(
    ref,
    () => ({
      refresh: async () => {
        await refreshAll(false);
      },
    }),
    [refreshAll],
  );

  useTaskFlowPolling({
    active,
    enabled: !state.activeModal && !savingTask && !submittingComment && !boardPanRef.current.active,
    intervalMs: taskFlowConfig.task_flow_poll_interval_sec * 1000,
    onPoll: async (incremental) => {
      await refreshAll(Boolean(incremental));
    },
  });

  useTaskFlowPolling({
    active,
    enabled:
      !state.activeModal &&
      !savingTask &&
      !submittingComment &&
      sessionAutoRefreshEnabled &&
      Boolean(state.selectedTaskId),
    intervalMs: renderedSession?.dialog_active ? 2_000 : 4_000,
    onPoll: async (incremental) => {
      await refreshCurrentSessionIncrementally(Boolean(incremental));
    },
  });

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!boardPanRef.current.active || !boardRef.current) {
        return;
      }
      const deltaX = event.clientX - boardPanRef.current.startX;
      boardRef.current.scrollLeft = boardPanRef.current.scrollLeft - deltaX;
    };

    const clearBoardPan = () => {
      boardPanRef.current = {
        active: false,
        scrollLeft: 0,
        startX: 0,
      };
      boardRef.current?.classList.remove("board-viewport--panning");
      sectionRef.current?.classList.remove("taskflow-page--panning");
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", clearBoardPan);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", clearBoardPan);
    };
  }, []);

  const handleBoardMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement) || event.button !== 0 || !boardRef.current) {
      return;
    }
    if (event.target.closest(".task-card, button, input, label, textarea, select, a")) {
      return;
    }
    if (!event.target.closest(".board-viewport, .task-column, .task-column__body, .task-column__head")) {
      return;
    }
    if (boardRef.current.scrollWidth <= boardRef.current.clientWidth + 8) {
      return;
    }
    boardPanRef.current = {
      active: true,
      scrollLeft: boardRef.current.scrollLeft,
      startX: event.clientX,
    };
    boardRef.current.classList.add("board-viewport--panning");
    sectionRef.current?.classList.add("taskflow-page--panning");
    event.preventDefault();
  }, []);

  const handleFlowFilterChange = useCallback((flowId: string) => {
    state.setFlowFilter(flowId);
    state.selectTask("");
    state.setSelectedTaskIds(new Set());
    state.setSessionFeedOpen(false);
    setSessionInsights(null);
  }, [state]);

  const handleDropStatus = useCallback(
    async (nextStatus: string) => {
      if (!dragTaskIdRef.current || !profileId) {
        return;
      }
      const taskIds = state.selectedTaskIds.has(dragTaskIdRef.current)
        ? [...state.selectedTaskIds]
        : [dragTaskIdRef.current];
      const changedIds = taskIds.filter((taskId) => {
        const task = findBoardTask(board, taskId);
        return task && task.status !== nextStatus;
      });
      if (!changedIds.length) {
        dragTaskIdRef.current = "";
        return;
      }
      try {
        await bulkMoveTaskItems(api, profileId, changedIds, nextStatus, taskFlowConfig);
        notify("Tasks moved.", "success");
        await refreshAll(false);
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      } finally {
        dragTaskIdRef.current = "";
      }
    },
    [api, board, notify, profileId, refreshAll, state.selectedTaskIds, taskFlowConfig],
  );

  const validationContext = useMemo(
    () => ({ profileId, profiles, employees }),
    [profileId, profiles, employees],
  );

  const handleCreateProject = useCallback(async () => {
    const error = validateProjectDraft(state.createProject.draft, validationContext);
    if (error) {
      state.setCreateProjectError(error);
      return;
    }
    state.setCreateProjectError("");
    state.setModalBusy(true);
    try {
      const project = await createTaskProject(api, profileId, state.createProject.draft, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      if (project?.id) {
        state.setFlowFilter(project.id);
      }
      state.selectTask("");
      state.setSelectedTaskIds(new Set());
      state.setCreateProjectDraft({
        ...state.createProject.draft,
        description: "",
        labels: "",
        title: "",
      });
      notify("Flow created.", "success");
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.setCreateProjectError(resolveTaskFlowError(error));
    } finally {
      state.setModalBusy(false);
    }
  }, [api, notify, profileId, refreshAll, state, taskFlowConfig, validationContext]);

  const handleEditProject = useCallback((flowId: string) => {
    const flow = flows.find((item) => item.id === flowId);
    if (!flow) {
      return;
    }
    setEditingFlowId(flow.id);
    state.setCreateProjectError("");
    state.setCreateProjectDraft({
      default_owner_ref: String(flow.default_owner_ref || ""),
      default_owner_type: String(flow.default_owner_type || ""),
      description: String(flow.description || ""),
      labels: (flow.labels || []).join(", "),
      title: String(flow.title || ""),
    });
  }, [flows, state]);

  const handleCancelProjectEdit = useCallback(() => {
    setEditingFlowId("");
    state.setCreateProjectError("");
    state.setCreateProjectDraft({
      ...state.createProject.draft,
      description: "",
      labels: "",
      title: "",
    });
  }, [state]);

  const handleUpdateProject = useCallback(async () => {
    if (!editingFlowId) {
      return;
    }
    const error = validateProjectDraft(state.createProject.draft, validationContext);
    if (error) {
      state.setCreateProjectError(error);
      return;
    }
    state.setCreateProjectError("");
    state.setModalBusy(true);
    try {
      await updateTaskProject(api, profileId, editingFlowId, state.createProject.draft, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      setEditingFlowId("");
      state.setCreateProjectDraft({
        ...state.createProject.draft,
        description: "",
        labels: "",
        title: "",
      });
      notify("Flow updated.", "success");
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.setCreateProjectError(resolveTaskFlowError(error));
    } finally {
      state.setModalBusy(false);
    }
  }, [api, editingFlowId, notify, profileId, refreshAll, state, taskFlowConfig, validationContext]);

  const handleSubmitProject = useCallback(async () => {
    if (editingFlowId) {
      await handleUpdateProject();
      return;
    }
    await handleCreateProject();
  }, [editingFlowId, handleCreateProject, handleUpdateProject]);

  const handleCloseProjectManager = useCallback(() => {
    setEditingFlowId("");
    state.closeModal();
  }, [state]);

  const handleDeleteProject = useCallback(
    async (flowId: string) => {
      state.setDeleteError("");
      state.setModalBusy(true);
      try {
        await deleteTaskProject(api, profileId, flowId, taskFlowConfig);
        if (profileIdRef.current !== profileId) {
          return;
        }
        if (state.flowFilter === flowId) {
          state.setFlowFilter("");
        }
        if (detail?.task?.flow_id === flowId) {
          state.selectTask("");
          state.setSessionFeedOpen(false);
          setSessionInsights(null);
        }
        notify("Flow deleted.", "success");
        await refreshAll(false);
      } catch (error) {
        if (profileIdRef.current !== profileId) {
          return;
        }
        state.setDeleteError(resolveTaskFlowError(error));
      } finally {
        state.setModalBusy(false);
      }
    },
    [api, detail?.task?.flow_id, notify, profileId, refreshAll, state, taskFlowConfig],
  );

  const handleCreateTask = useCallback(async () => {
    if (rootEmployeeError) {
      state.setCreateTaskError(rootEmployeeError);
      return;
    }
    const error = validateTaskDraft(createTaskDraft, validationContext);
    if (error) {
      state.setCreateTaskError(error);
      return;
    }
    state.setCreateTaskError("");
    state.setModalBusy(true);
    try {
      const task = await createTaskItem(api, profileId, createTaskDraft, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.closeModal();
      if (task?.id) {
        state.selectTask(task.id);
      }
      notify("Task created.", "success");
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.setCreateTaskError(resolveTaskFlowError(error));
    } finally {
      state.setModalBusy(false);
    }
  }, [api, createTaskDraft, notify, profileId, refreshAll, rootEmployeeError, state, taskFlowConfig, validationContext]);

  const handleSaveTask = useCallback(async () => {
    if (!state.selectedTaskId) {
      return;
    }
    const taskId = state.selectedTaskId;
    const error = validateTaskDraft(editorDraft, validationContext, { requireFlow: false });
    if (error) {
      setEditorError(error);
      return;
    }
    setEditorError("");
    setSavingTask(true);
    try {
      const task = await updateTaskItem(api, profileId, taskId, editorDraft, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      if (task && selectedTaskIdRef.current === taskId) {
        setEditorDraft(taskDraftFromTask(task));
      }
      notify("Task updated.", "success");
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current !== profileId) {
        return;
      }
      setEditorError(resolveTaskFlowError(error));
    } finally {
      setSavingTask(false);
    }
  }, [api, editorDraft, notify, profileId, refreshAll, state.selectedTaskId, taskFlowConfig, validationContext]);

  const handleDeleteTask = useCallback(async () => {
    if (!state.selectedTaskId) {
      return;
    }
    state.setDeleteError("");
    state.setModalBusy(true);
    try {
      await deleteTaskItem(api, profileId, state.selectedTaskId, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.closeModal();
      state.setSelectedTaskIds(new Set());
      state.selectTask("");
      state.setSessionFeedOpen(false);
      setSessionInsights(null);
      notify("Task deleted.", "success");
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.setDeleteError(resolveTaskFlowError(error));
      state.setModalBusy(false);
    }
  }, [api, notify, profileId, refreshAll, state, taskFlowConfig]);

  const handleDeleteSelected = useCallback(async () => {
    const taskIds = [...state.selectedTaskIds];
    if (!taskIds.length) {
      return;
    }
    state.setDeleteError("");
    state.setModalBusy(true);
    try {
      const response = await bulkDeleteTaskItems(api, profileId, taskIds, taskFlowConfig);
      if (profileIdRef.current !== profileId) {
        return;
      }
      if (response.error_count) {
        state.setDeleteError(response.errors?.[0]?.reason || "Some tasks could not be deleted.");
      } else {
        state.closeModal();
      }
      state.setSelectedTaskIds(new Set());
      if (state.selectedTaskId && (response.deleted_task_ids || []).includes(state.selectedTaskId)) {
        state.selectTask("");
        state.setSessionFeedOpen(false);
        setSessionInsights(null);
      }
      notify(`Deleted ${response.deleted_count || 0} tasks.`, "success");
      await refreshAll(false);
    } catch (error) {
      if (profileIdRef.current !== profileId) {
        return;
      }
      state.setDeleteError(resolveTaskFlowError(error));
    } finally {
      state.setModalBusy(false);
    }
  }, [api, notify, profileId, refreshAll, state, taskFlowConfig]);

  const handleSubmitComment = useCallback(
    async (message: string) => {
      if (!state.selectedTaskId) {
        return;
      }
      setSubmittingComment(true);
      try {
        await createTaskComment(api, profileId, state.selectedTaskId, message, taskFlowConfig);
        notify("Comment added.", "success");
        await detailQuery.refetch();
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      } finally {
        setSubmittingComment(false);
      }
    },
    [api, detailQuery, notify, profileId, state.selectedTaskId, taskFlowConfig],
  );

  const handleSaveDocument = useCallback(
    async (draft: TaskFlowDocumentDraft, scopeId: string, baseRevision?: number | null) => {
      setSavingDocumentId("new");
      try {
        await putTaskDocument(api, profileId, draft, scopeId, taskFlowConfig, baseRevision);
        notify("Document saved.", "success");
        await Promise.all([contextQuery.refetch(), flowDocumentsQuery.refetch()]);
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      } finally {
        setSavingDocumentId("");
      }
    },
    [api, contextQuery, flowDocumentsQuery, notify, profileId, taskFlowConfig],
  );

  const handleSaveFlowDocument = useCallback(
    async (draft: TaskFlowDocumentDraft, flowId: string, baseRevision?: number | null) => {
      setSavingDocumentId("new-flow-doc");
      try {
        await putTaskDocument(api, profileId, draft, flowId, taskFlowConfig, baseRevision);
        notify("Flow document saved.", "success");
        await flowDocumentsQuery.refetch();
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      } finally {
        setSavingDocumentId("");
      }
    },
    [api, flowDocumentsQuery, notify, profileId, taskFlowConfig],
  );

  const handleConfirmDocument = useCallback(
    async (document: TaskFlowDocument) => {
      setSavingDocumentId(document.id);
      try {
        await confirmTaskDocument(api, profileId, document, taskFlowConfig);
        notify("Document confirmed.", "success");
        await Promise.all([contextQuery.refetch(), flowDocumentsQuery.refetch()]);
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      } finally {
        setSavingDocumentId("");
      }
    },
    [api, contextQuery, flowDocumentsQuery, notify, profileId, taskFlowConfig],
  );

  const handleConfirmFlowDocument = useCallback(
    async (document: TaskFlowDocument) => {
      setSavingDocumentId(document.id);
      try {
        await confirmTaskDocument(api, profileId, document, taskFlowConfig);
        notify("Flow document confirmed.", "success");
        await flowDocumentsQuery.refetch();
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      } finally {
        setSavingDocumentId("");
      }
    },
    [api, flowDocumentsQuery, notify, profileId, taskFlowConfig],
  );

  const handleApproveReview = useCallback(async () => {
    if (!state.selectedTaskId) {
      return;
    }
    try {
      await approveTaskReview(api, profileId, state.selectedTaskId, taskFlowConfig);
      notify("Review approved.", "success");
      await refreshAll(false);
    } catch (error) {
      notify(resolveTaskFlowError(error), "danger");
    }
  }, [api, notify, profileId, refreshAll, state.selectedTaskId, taskFlowConfig]);

  const handleRequestChanges = useCallback(
    async (reviewDraft: { owner_ref: string; owner_type: string; reason_text: string }) => {
      if (!state.selectedTaskId) {
        return;
      }
      const error = validateReviewDraft(reviewDraft, validationContext);
      if (error) {
        notify(error, "danger");
        return;
      }
      try {
        await requestTaskReviewChanges(api, profileId, state.selectedTaskId, reviewDraft, taskFlowConfig);
        notify("Changes requested.", "success");
        await refreshAll(false);
      } catch (error) {
        notify(resolveTaskFlowError(error), "danger");
      }
    },
    [api, notify, profileId, refreshAll, state.selectedTaskId, taskFlowConfig, validationContext],
  );

  const handleSaveSettings = useCallback(async () => {
    const error = validateSettingsDraft(state.settings.draft, {
      profileId,
      profiles,
      employees,
    });
    if (error) {
      state.setSettingsError(error);
      return;
    }
    state.setSettingsError("");
    state.setModalBusy(true);
    try {
      await updateConfig(buildSettingsPatch(state.settings.draft));
      notify("Task Flow settings saved.", "success");
      state.closeModal();
      await refreshAll(false);
      await employeesQuery.refetch();
    } catch (error) {
      state.setSettingsError(resolveTaskFlowError(error));
    } finally {
      state.setModalBusy(false);
    }
  }, [notify, profileId, profiles, refreshAll, state, employees, employeesQuery, updateConfig]);

  const pageError = [projectsQuery.error, boardQuery.error, reviewQuery.error, employeesQuery.error].find(Boolean);
  const employeesLoading = Boolean(employeesQuery.isFetching && !employeesQuery.data);
  const projectsLoading = Boolean(projectsQuery.isFetching && !projectsQuery.data);
  const noProjectFlows = !projectsLoading && flows.length === 0;
  const createTaskDisabledReason = employeesLoading
    ? "Loading employees before routing work through the root intake employee."
    : rootEmployeeError || (noProjectFlows ? "Create one project flow before adding Task Flow work." : "");
  const createTaskRecovery = rootEmployeeError
    ? { label: "Open Employees", onClick: () => navigateToRoute("employees") }
    : noProjectFlows
      ? { label: "Open Flows", onClick: state.openManageProjectsModal }
      : null;
  const createTaskDisabled = employeesLoading || Boolean(rootEmployeeError) || noProjectFlows;

  return (
    <section className="route-page route-page--taskflow taskflow-page" ref={sectionRef}>
      <TaskFlowHeader
        flowFilter={state.flowFilter}
        flows={flows}
        createTaskDisabled={createTaskDisabled}
        createTaskDisabledReason={createTaskDisabledReason}
        onClearSelection={state.clearSelection}
        onCreateTask={() => state.openTaskModal(state.flowFilter || flows[0]?.id || "")}
        onDeleteSelected={state.openDeleteSelectedModal}
        onOpenEmployees={() => navigateToRoute("employees")}
        onFilterChange={handleFlowFilterChange}
        onManageFlows={state.openManageProjectsModal}
        onRunKnowledgeMaintenance={() => void handleRunKnowledgeMaintenance()}
        onOpenReview={state.openReviewModal}
        onOpenSettings={state.openSettingsModal}
        onRefresh={() => void refreshBoardManually()}
        refreshing={manualRefreshingBoard}
        knowledgeMaintenanceRunning={runningKnowledgeMaintenance}
        reviewCount={reviewTasks.length}
        selectedCount={state.selectedTaskIds.size}
      />

      {pageError ? <div className="inline-alert inline-alert--danger">{resolveTaskFlowError(pageError)}</div> : null}
      {knowledgeMaintenanceResult ? (
        <KnowledgeMaintenanceSummary
          flowTitleById={flowTitleById}
          onOpenTask={(taskId) => {
            state.selectTask(taskId);
            closeSessionFeed();
            setSessionInsights(null);
          }}
          result={knowledgeMaintenanceResult}
        />
      ) : null}
      {createTaskDisabledReason && createTaskRecovery ? (
        <div className="inline-alert inline-alert--warning taskflow-gate-alert" role="status">
          <span>{createTaskDisabledReason}</span>
          <button className="button button--ghost button--compact" onClick={createTaskRecovery.onClick} type="button">
            {createTaskRecovery.label}
          </button>
        </div>
      ) : null}

      <div className={`taskflow-layout ${selectedTask ? "taskflow-layout--open" : ""}`}>
        <section className="board-shell glass-panel">
          <TaskBoard
            board={board}
            boardRef={boardRef}
            flowTitleById={flowTitleById}
            loading={Boolean(boardQuery.isFetching && !board)}
            onBoardMouseDown={handleBoardMouseDown}
            onDragEnd={() => {
              dragTaskIdRef.current = "";
            }}
            onDragStart={(taskId) => {
              dragTaskIdRef.current = taskId;
            }}
            onDropStatus={(status) => void handleDropStatus(status)}
            onOpenTask={(taskId) => {
              state.selectTask(taskId);
              closeSessionFeed();
              setSessionInsights(null);
            }}
            onToggleTask={(taskId, checked) => state.toggleTaskSelection(taskId, checked)}
            selectedTaskId={state.selectedTaskId}
            selectedTaskIds={state.selectedTaskIds}
          />
        </section>

        {state.selectedTaskId ? (
          <TaskInspector
            config={taskFlowConfig}
            detail={detail}
            detailLoading={Boolean(detailQuery.isFetching && !detail)}
            draft={editorDraft}
            error={editorError || sessionError || (detailQuery.error ? resolveTaskFlowError(detailQuery.error) : "")}
            onApproveReview={() => void handleApproveReview()}
            onClose={() => {
              state.selectTask("");
              closeSessionFeed();
              setSessionInsights(null);
            }}
            onDelete={state.openDeleteTaskModal}
            onDraftChange={setEditorDraft}
            onOpenSessionFeed={openSessionFeed}
            onRefreshSession={() => void refreshCurrentSessionManually()}
            onRequestChanges={(reviewDraft) => void handleRequestChanges(reviewDraft)}
            onSave={() => void handleSaveTask()}
            onSubmitComment={(message) => void handleSubmitComment(message)}
            commenting={submittingComment}
            profileId={profileId}
            profiles={profiles}
            saving={savingTask}
            sessionError={sessionError}
            sessionRefreshing={refreshingSession}
            sessionInsights={sessionInsights}
            employees={employees}
            knowledgePanel={
              <TaskKnowledgePanel
                busyDocumentId={savingDocumentId}
                context={contextQuery.data || null}
                error={contextQuery.error ? resolveTaskFlowError(contextQuery.error) : ""}
                loading={Boolean(contextQuery.isFetching && !contextQuery.data)}
                onConfirmDocument={(document) => void handleConfirmDocument(document)}
                onSaveDocument={(draft, scopeId, baseRevision) => void handleSaveDocument(draft, scopeId, baseRevision)}
                savingDocument={savingDocumentId === "new"}
              />
            }
          />
        ) : null}
      </div>

      <TaskSessionModal
        error={sessionError}
        onClose={closeSessionFeed}
        onRefresh={() => void refreshCurrentSessionManually()}
        open={state.sessionFeedOpen}
        refreshing={refreshingSession}
        sessionInsights={sessionInsights}
        task={selectedTask}
      />

      <ManageProjectsModal
        activeFlowId={state.flowFilter}
        busy={state.modalBusy}
        config={taskFlowConfig}
        draft={state.createProject.draft}
        editingFlowId={editingFlowId}
        error={state.createProject.error || state.deleteState.error}
        flowDocuments={flowDocumentsQuery.data || []}
        flowDocumentsError={flowDocumentsQuery.error ? resolveTaskFlowError(flowDocumentsQuery.error) : ""}
        flowDocumentsLoading={Boolean(flowDocumentsQuery.isFetching && !flowDocumentsQuery.data)}
        flowSearchQuery={state.flowSearchQuery}
        flows={flows}
        busyDocumentId={savingDocumentId}
        onCancel={handleCloseProjectManager}
        onCancelDelete={state.clearPendingProjectDelete}
        onCancelEdit={handleCancelProjectEdit}
        onConfirmFlowDocument={(document) => void handleConfirmFlowDocument(document)}
        onConfirmDelete={(flowId) => void handleDeleteProject(flowId)}
        onDraftChange={state.setCreateProjectDraft}
        onEdit={handleEditProject}
        onFilter={(flowId) => {
          handleFlowFilterChange(flowId);
          state.clearPendingProjectDelete();
        }}
        onRequestDelete={state.requestProjectDelete}
        onSaveFlowDocument={(draft, flowId, baseRevision) => void handleSaveFlowDocument(draft, flowId, baseRevision)}
        onSearchChange={state.setFlowSearchQuery}
        onSubmit={() => void handleSubmitProject()}
        open={state.activeModal === "manage-projects"}
        pendingDeleteId={state.deleteState.pendingProjectId}
        profileId={profileId}
        profiles={profiles}
        employees={employees}
      />

      <CreateTaskModal
        busy={state.modalBusy}
        config={taskFlowConfig}
        draft={createTaskDraft}
        error={state.createTask.error}
        flows={flows}
        onCancel={state.closeModal}
        onDraftChange={state.setCreateTaskDraft}
        onSubmit={() => void handleCreateTask()}
        open={state.activeModal === "task"}
        profileId={profileId}
        profiles={profiles}
        employees={employees}
        rootEmployee={rootEmployee}
      />

      <TaskFlowSettingsModal
        busy={state.modalBusy}
        config={taskFlowConfig}
        draft={state.settings.draft}
        error={state.settings.error}
        onCancel={state.closeModal}
        onDraftChange={state.setSettingsDraft}
        onSubmit={() => void handleSaveSettings()}
        open={state.activeModal === "settings"}
        profileId={profileId}
        profiles={profiles}
        employees={employees}
      />

      <ReviewQueueModal
        onCancel={state.closeModal}
        onSelectTask={(taskId) => {
          state.closeModal();
          state.selectTask(taskId);
          closeSessionFeed();
          setSessionInsights(null);
        }}
        open={state.activeModal === "review"}
        tasks={reviewTasks}
      />

      <DeleteTaskModal
        busy={state.modalBusy}
        error={state.deleteState.error}
        onCancel={state.closeModal}
        onConfirm={() => void handleDeleteTask()}
        open={state.activeModal === "delete-task"}
        title={selectedTask?.title || state.selectedTaskId}
      />

      <DeleteSelectedTasksModal
        busy={state.modalBusy}
        count={state.selectedTaskIds.size}
        error={state.deleteState.error}
        onCancel={state.closeModal}
        onConfirm={() => void handleDeleteSelected()}
        open={state.activeModal === "delete-selected"}
      />
    </section>
  );
});

function KnowledgeMaintenanceSummary({
  flowTitleById,
  onOpenTask,
  result,
}: {
  flowTitleById: Map<string, string>;
  onOpenTask: (taskId: string) => void;
  result: TaskFlowKnowledgeMaintenanceSweep;
}) {
  const flows = Array.isArray(result.flows) ? result.flows : [];
  return (
    <div className="inline-alert inline-alert--info taskflow-maintenance-summary" role="status">
      <div>
        <strong>CTO knowledge review</strong>
        <span>
          {" "}
          checked {Number(result.checked_flow_count || 0)}, created {Number(result.created_task_count || 0)}, woke{" "}
          {Number(result.woken_task_count || 0)}
        </span>
      </div>
      {flows.length ? (
        <div className="taskflow-maintenance-summary__items">
          {flows.slice(0, 4).map((flow) => {
            const taskId = flow.task?.id || "";
            const flowTitle = flowTitleById.get(flow.flow_id) || flow.flow_title || flow.flow_id;
            const reasons = Array.isArray(flow.reasons) ? flow.reasons : [];
            return (
              <div className="taskflow-maintenance-summary__item" key={`${flow.flow_id}-${flow.action || "checked"}`}>
                <span className="badge badge--muted">{flow.action || flow.health_status || "checked"}</span>
                <span>{flowTitle}</span>
                {reasons.length ? <span className="muted">{reasons.join(", ")}</span> : null}
                {taskId ? (
                  <button className="button button--ghost button--tiny" onClick={() => onOpenTask(taskId)} type="button">
                    Open task
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function findBoardTask(board: AppRouteProps["config"] | unknown, taskId: string) {
  const typedBoard = board as { columns?: Array<{ tasks?: TaskFlowTask[] }> } | null;
  for (const column of typedBoard?.columns || []) {
    const match = (column.tasks || []).find((task) => task.id === taskId);
    if (match) {
      return match;
    }
  }
  return null;
}
