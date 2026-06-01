import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery } from "@tanstack/react-query";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type FormEvent } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import {
  createTaskFlowEmployee,
  deleteTaskFlowEmployee,
  getTaskFlowOrgChart,
  listTaskFlowEmployees,
  resolveTaskFlowError,
  updateTaskFlowEmployee,
} from "@/features/task-flow/model/task-flow.api";
import type { TaskFlowEmployee, TaskFlowEmployeeDraft, TaskFlowOrgChart } from "@/features/task-flow/model/task-flow.types";
import { ModalDialog } from "@/shared/ui/ModalDialog";
import { PageHeader } from "@/shared/ui/PageHeader";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

const ROOT_CREATE_ID = "__root__";

export const EmployeesPage = forwardRef<RouteHandle, AppRouteProps>(function EmployeesPage(
  { active = true, api, notify, profileId },
  ref,
) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [createParentId, setCreateParentId] = useState<string>("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string>("");
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string>("");
  const [layoutMode, setLayoutMode] = useState<"tree" | "compact">("tree");
  const [layoutVersion, setLayoutVersion] = useState(0);

  const employeesQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey: ["employees", profileId, "list"],
    queryFn: () => listTaskFlowEmployees(api, profileId),
    refetchOnWindowFocus: false,
  });

  const orgChartQuery = useQuery({
    enabled: active && Boolean(profileId),
    queryKey: ["employees", profileId, "org-chart"],
    queryFn: () => getTaskFlowOrgChart(api, profileId),
    refetchOnWindowFocus: false,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: (draft: TaskFlowEmployeeDraft) => createTaskFlowEmployee(api, profileId, draft),
    onSuccess: async () => {
      setCreateParentId("");
      await refresh();
      notify("Employee created", "success");
    },
    onError: (error) => notify(resolveTaskFlowError(error), "danger"),
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: ({ employeeId, draft }: { employeeId: string; draft: TaskFlowEmployeeDraft }) =>
      updateTaskFlowEmployee(api, profileId, employeeId, draft),
    onSuccess: async (employee) => {
      setEditingEmployeeId("");
      if (employee?.id) {
        setSelectedEmployeeId(employee.id);
      }
      await refresh();
      notify("Employee updated", "success");
    },
    onError: (error) => notify(resolveTaskFlowError(error), "danger"),
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: (employeeId: string) => deleteTaskFlowEmployee(api, profileId, employeeId),
    onSuccess: async () => {
      setDeletingEmployeeId("");
      setSelectedEmployeeId("");
      await refresh();
      notify("Employee deleted", "success");
    },
    onError: (error) => notify(resolveTaskFlowError(error), "danger"),
  });

  const refresh = async () => {
    await Promise.all([employeesQuery.refetch(), orgChartQuery.refetch()]);
  };

  useImperativeHandle(ref, () => ({ refresh }), [employeesQuery, orgChartQuery]);

  const orgChart = orgChartQuery.data || null;
  const employeeRows = useMemo(() => buildEmployeeRows(orgChart), [orgChart]);
  const graph = useMemo(() => buildGraph(orgChart, layoutMode), [orgChart, layoutMode]);
  const selectedEmployee = selectedEmployeeId ? orgChart?.employees[selectedEmployeeId] || null : null;
  const editingEmployee = editingEmployeeId ? orgChart?.employees[editingEmployeeId] || null : null;
  const deletingEmployee = deletingEmployeeId ? orgChart?.employees[deletingEmployeeId] || null : null;
  const createParent = createParentId && createParentId !== ROOT_CREATE_ID ? orgChart?.employees[createParentId] || null : null;
  const defaultCreateParentId = employeeRows.some((employee) => employee.id === "cto") ? "cto" : ROOT_CREATE_ID;
  const loading = (employeesQuery.isFetching && !employeesQuery.data) || (orgChartQuery.isFetching && !orgChart);
  const error = employeesQuery.error || orgChartQuery.error;

  useEffect(() => {
    if (selectedEmployeeId && orgChart && !orgChart.employees[selectedEmployeeId]) {
      setSelectedEmployeeId("");
    }
  }, [orgChart, selectedEmployeeId]);

  return (
    <section className="route-page employees-page">
      <PageHeader
        actions={
          <div className="button-row">
            <button
              className="button button--ghost button--compact"
              onClick={() => setCreateParentId(defaultCreateParentId)}
              type="button"
            >
              New Employee
            </button>
            <button
              className="button button--ghost button--compact"
              onClick={() => {
                setLayoutMode("tree");
                setLayoutVersion((value) => value + 1);
              }}
              type="button"
            >
              Sort Tree
            </button>
            <button
              className="button button--ghost button--compact"
              onClick={() => setLayoutMode((value) => (value === "tree" ? "compact" : "tree"))}
              type="button"
            >
              {layoutMode === "tree" ? "Compact" : "Tree"}
            </button>
            <button className="button button--ghost button--compact" onClick={() => void refresh()} type="button">
              Refresh
            </button>
          </div>
        }
        eyebrow="Workspace / Employees"
        title="Employees"
      />

      {error ? <div className="inline-alert inline-alert--danger">{resolveTaskFlowError(error)}</div> : null}

      {loading ? (
        <SurfaceLoader center message="Loading employees…" title="Loading…" />
      ) : (
        <div className="employees-layout">
          <section className="employees-graph glass-panel">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Organization</p>
                <h3 className="panel-head__title">{profileId}</h3>
              </div>
              <div className="flow-manager__item-badges">
                <span className="badge badge--muted">{employeeRows.length} employees</span>
                <span className={orgChart?.validation.valid ? "badge badge--success" : "badge badge--danger"}>
                  {orgChart?.validation.valid ? "valid" : "invalid"}
                </span>
              </div>
            </div>
            {graph.nodes.length ? (
              <div className="employees-graph__canvas">
                <ReactFlowProvider>
                  <EmployeeGraph
                    edges={graph.edges}
                    flowKey={`${layoutMode}-${layoutVersion}-${graph.nodes.length}`}
                    nodes={graph.nodes}
                    onCreateFromParent={setCreateParentId}
                    onSelectEmployee={setSelectedEmployeeId}
                  />
                </ReactFlowProvider>
              </div>
            ) : (
              <div className="empty-state">
                <h3>No employees configured</h3>
                <p>Create the first employee to enable Task Flow assignment and employee queues.</p>
                <button className="button button--primary button--compact" onClick={() => setCreateParentId(ROOT_CREATE_ID)} type="button">
                  Create CTO
                </button>
              </div>
            )}
          </section>

          {orgChart?.validation.issues.length ? (
            <section className="employees-validation glass-panel">
              <div className="panel-head panel-head--compact">
                <div>
                  <p className="panel-head__eyebrow">Validation</p>
                  <h3 className="panel-head__title">Org Chart Issues</h3>
                </div>
              </div>
              <div className="timeline-list timeline-list--session">
                {orgChart.validation.issues.map((issue) => (
                  <article className="timeline-item timeline-item--session" key={`${issue.code}-${issue.employee_id}-${issue.target_employee_id}`}>
                    <div className="timeline-item__head">
                      <p>{issue.employee_id || "employee"}</p>
                      <span className="badge badge--danger">{issue.code || issue.severity || "issue"}</span>
                    </div>
                    <p className="timeline-item__copy">{issue.message}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <EmployeeDetailsModal
        busy={deleteEmployeeMutation.isPending}
        employee={selectedEmployee}
        onClose={() => setSelectedEmployeeId("")}
        onDelete={(employeeId) => setDeletingEmployeeId(employeeId)}
        onEdit={(employeeId) => setEditingEmployeeId(employeeId)}
      />
      <EmployeeFormModal
        busy={createEmployeeMutation.isPending}
        employeeCount={employeeRows.length}
        employees={employeeRows}
        mode="create"
        onClose={() => setCreateParentId("")}
        onSubmit={(draft) => createEmployeeMutation.mutate(draft)}
        parent={createParent}
        parentId={createParentId}
      />
      <EmployeeFormModal
        busy={updateEmployeeMutation.isPending}
        employee={editingEmployee}
        employeeCount={employeeRows.length}
        employees={employeeRows}
        mode="edit"
        onClose={() => setEditingEmployeeId("")}
        onSubmit={(draft) => {
          if (editingEmployee?.id) {
            updateEmployeeMutation.mutate({ employeeId: editingEmployee.id, draft });
          }
        }}
        parent={editingEmployee?.manager_id ? orgChart?.employees[editingEmployee.manager_id] || null : null}
        parentId={editingEmployee?.manager_id || ROOT_CREATE_ID}
      />
      <DeleteEmployeeModal
        busy={deleteEmployeeMutation.isPending}
        employee={deletingEmployee}
        onClose={() => setDeletingEmployeeId("")}
        onConfirm={(employeeId) => deleteEmployeeMutation.mutate(employeeId)}
      />
    </section>
  );
});

function EmployeeGraph({
  edges,
  flowKey,
  nodes,
  onCreateFromParent,
  onSelectEmployee,
}: {
  edges: Edge[];
  flowKey: string;
  nodes: Node[];
  onCreateFromParent: (employeeId: string) => void;
  onSelectEmployee: (employeeId: string) => void;
}) {
  const [connectingFrom, setConnectingFrom] = useState("");
  const handleNodeClick: NodeMouseHandler = (_, node) => onSelectEmployee(node.id);

  return (
    <ReactFlow
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.28 }}
      key={flowKey}
      maxZoom={1.8}
      minZoom={0.42}
      nodes={nodes}
      nodesConnectable
      nodesDraggable={false}
      nodesFocusable
      onConnectEnd={(event) => {
        const target = event.target;
        const droppedOnPane = target instanceof Element && target.classList.contains("react-flow__pane");
        if (connectingFrom && droppedOnPane) {
          onCreateFromParent(connectingFrom);
        }
        setConnectingFrom("");
      }}
      onConnectStart={(_, params) => setConnectingFrom(params.nodeId || "")}
      onNodeClick={handleNodeClick}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} />
      <MiniMap pannable zoomable />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function EmployeeDetailsModal({
  busy,
  employee,
  onClose,
  onDelete,
  onEdit,
}: {
  busy: boolean;
  employee: TaskFlowEmployee | null | undefined;
  onClose: () => void;
  onDelete: (employeeId: string) => void;
  onEdit: (employeeId: string) => void;
}) {
  if (!employee) {
    return null;
  }
  return (
    <ModalDialog busy={busy} closeLabel="Close employee details" eyebrow={employee.id} onClose={onClose} open title={employee.name} wide>
      <div className="modal-section">
        <p className="muted">{employee.title} · {employee.role}</p>
        <p>{employee.body || "No employee brief yet."}</p>
        <div className="flow-manager__item-badges">
          <span className={employee.status === "active" ? "badge badge--success" : "badge badge--muted"}>{employee.status}</span>
          {employee.manager_id ? <span className="badge badge--muted">manager: {employee.manager_id}</span> : null}
          {employee.derived_reports?.length ? <span className="badge badge--accent">{employee.derived_reports.length} reports</span> : null}
          {employee.can_delegate_to?.length ? <span className="badge badge--review">{employee.can_delegate_to.length} delegates</span> : null}
          {employee.allowed_tools?.length ? <span className="badge badge--ai">{employee.allowed_tools.length} tools</span> : null}
          {employee.can_use_subagents ? <span className="badge badge--live">subagents</span> : null}
        </div>
        <div className="modal-actions">
          <button className="button button--ghost" disabled={busy} onClick={() => onEdit(employee.id)} type="button">
            Edit
          </button>
          <button className="button button--danger" disabled={busy} onClick={() => onDelete(employee.id)} type="button">
            Delete
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

function EmployeeFormModal({
  busy,
  employee,
  employeeCount,
  employees,
  mode,
  onClose,
  onSubmit,
  parent,
  parentId,
}: {
  busy: boolean;
  employee?: TaskFlowEmployee | null;
  employeeCount: number;
  employees: TaskFlowEmployee[];
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (draft: TaskFlowEmployeeDraft) => void;
  parent: TaskFlowEmployee | null | undefined;
  parentId: string;
}) {
  const [draft, setDraft] = useState(() => employeeToDraft(employee) || defaultEmployeeDraft(parentId, employeeCount));
  useEffect(() => {
    setDraft(employeeToDraft(employee) || defaultEmployeeDraft(parentId, employeeCount));
  }, [employee, employeeCount, parentId]);

  if (mode === "create" && !parentId) {
    return null;
  }
  if (mode === "edit" && !employee) {
    return null;
  }
  const update = (patch: Partial<TaskFlowEmployeeDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...draft,
      allowed_tools: draft.allowed_tools || [],
      manager_id: draft.manager_id === ROOT_CREATE_ID ? null : draft.manager_id || null,
      status: draft.status || "active",
      subagent_allowlist: draft.subagent_allowlist || [],
    });
  };
  const unavailableManagerIds = new Set([employee?.id || "", ...(employee?.derived_reports || [])].filter(Boolean));
  const managerOptions = employees.filter((item) => !unavailableManagerIds.has(item.id));
  const toolsValue = (draft.allowed_tools || []).join(", ");
  const subagentsValue = (draft.subagent_allowlist || []).join(", ");
  const isEdit = mode === "edit";

  return (
    <ModalDialog
      busy={busy}
      closeLabel={isEdit ? "Close employee editor" : "Close employee creation"}
      description={parent ? `Reports to ${parent.name}` : "Root employee for this profile"}
      eyebrow={isEdit ? draft.id : "New Employee"}
      onClose={onClose}
      open={Boolean(parentId)}
      title={isEdit ? "Edit Employee" : "Create Employee"}
      wide
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--two">
          <label className="field">
            <span>ID</span>
            <input
              disabled={busy || isEdit}
              onChange={(event) => update({ id: slugifyEmployeeId(event.target.value) })}
              required
              value={draft.id}
            />
          </label>
          <label className="field">
            <span>Name</span>
            <input
              disabled={busy}
              onChange={(event) => {
                const name = event.target.value;
                update({ id: isEdit ? draft.id : slugifyEmployeeId(name), name, title: draft.title || name });
              }}
              required
              value={draft.name}
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input disabled={busy} onChange={(event) => update({ title: event.target.value })} required value={draft.title} />
          </label>
          <label className="field">
            <span>Role</span>
            <input disabled={busy} onChange={(event) => update({ role: slugifyEmployeeId(event.target.value) })} required value={draft.role} />
          </label>
          <label className="field">
            <span>Status</span>
            <select disabled={busy} onChange={(event) => update({ status: event.target.value as TaskFlowEmployeeDraft["status"] })} value={draft.status || "active"}>
              <option value="active">active</option>
              <option value="disabled">disabled</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="field">
            <span>Manager</span>
            <select
              disabled={busy}
              onChange={(event) => update({ manager_id: event.target.value || null })}
              value={draft.manager_id || ""}
            >
              <option value="">Root employee</option>
              {managerOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.id})</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid form-grid--two">
          <label className="field">
            <span>Allowed tools</span>
            <input
              disabled={busy}
              onChange={(event) => update({ allowed_tools: parseCsv(event.target.value) })}
              placeholder="task.*, file.read"
              value={toolsValue}
            />
          </label>
          <label className="field">
            <span>Subagent allowlist</span>
            <input
              disabled={busy}
              onChange={(event) => update({ subagent_allowlist: parseCsv(event.target.value) })}
              placeholder="reviewer, researcher"
              value={subagentsValue}
            />
          </label>
        </div>
        <label className="field field--checkbox">
          <span>Runtime permissions</span>
          <span className="checkbox-row">
            <input
              checked={Boolean(draft.can_use_subagents)}
              disabled={busy}
              onChange={(event) => update({ can_use_subagents: event.target.checked })}
              type="checkbox"
            />
            <span>Can invoke subagent tools from employee sessions</span>
          </span>
        </label>
        <label className="field">
          <span>Description</span>
          <textarea disabled={busy} onChange={(event) => update({ body: event.target.value })} rows={6} value={draft.body || ""} />
        </label>
        <div className="modal-actions">
          <button className="button button--ghost" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button button--primary" disabled={busy || !draft.id || !draft.name || !draft.title || !draft.role} type="submit">
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function DeleteEmployeeModal({
  busy,
  employee,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  employee: TaskFlowEmployee | null | undefined;
  onClose: () => void;
  onConfirm: (employeeId: string) => void;
}) {
  if (!employee) {
    return null;
  }
  const reportCount = employee.derived_reports?.length || 0;
  const blockedByReports = reportCount > 0;

  return (
    <ModalDialog busy={busy} closeLabel="Close delete employee modal" eyebrow={employee.id} onClose={onClose} open title={`Delete ${employee.name}`} wide>
      <div className="modal-section">
        <p className="muted">
          Delete this employee descriptor from the selected profile. Task Flow tasks, flows, review assignments, and reports must be reassigned first.
        </p>
        {blockedByReports ? (
          <div className="inline-alert inline-alert--danger" role="alert">
            This employee manages {reportCount} report{reportCount === 1 ? "" : "s"}. Reassign or delete those employees before removing this manager.
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="button button--ghost" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button button--danger" disabled={busy || blockedByReports} onClick={() => onConfirm(employee.id)} type="button">
            {busy ? "Deleting…" : "Delete Employee"}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

function buildEmployeeRows(orgChart: TaskFlowOrgChart | null): TaskFlowEmployee[] {
  return Object.values(orgChart?.employees || {}).sort((left, right) => {
    const leftManager = left.manager_id || "";
    const rightManager = right.manager_id || "";
    if (leftManager !== rightManager) {
      return leftManager.localeCompare(rightManager);
    }
    return left.name.localeCompare(right.name);
  });
}

function buildGraph(orgChart: TaskFlowOrgChart | null, layoutMode: "tree" | "compact"): { edges: Edge[]; nodes: Node[] } {
  const employees = orgChart?.employees || {};
  const employeeIds = Object.keys(employees).sort();
  const childrenByParent = new Map<string, string[]>();
  for (const [source, target] of orgChart?.edges || []) {
    childrenByParent.set(source, [...(childrenByParent.get(source) || []), target]);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => (employees[left]?.name || left).localeCompare(employees[right]?.name || right));
  }

  const roots = (orgChart?.root_employee_ids || []).filter((id) => employees[id]);
  const effectiveRoots = roots.length ? roots : employeeIds.filter((id) => !employees[id].manager_id);
  const levelGap = layoutMode === "tree" ? 190 : 145;
  const leafGap = layoutMode === "tree" ? 270 : 220;
  const positions = new Map<string, { x: number; y: number }>();
  let cursor = 0;

  const place = (id: string, depth: number, seen: Set<string>): number => {
    if (seen.has(id)) {
      return cursor;
    }
    seen.add(id);
    const children = childrenByParent.get(id) || [];
    if (!children.length) {
      const x = cursor * leafGap;
      positions.set(id, { x, y: depth * levelGap });
      cursor += 1;
      return x;
    }
    const childCenters = children.map((childId) => place(childId, depth + 1, new Set(seen)));
    const x = (Math.min(...childCenters) + Math.max(...childCenters)) / 2;
    positions.set(id, { x, y: depth * levelGap });
    return x;
  };

  for (const id of effectiveRoots) {
    place(id, 0, new Set());
  }
  for (const id of employeeIds) {
    if (!positions.has(id)) {
      positions.set(id, { x: cursor * leafGap, y: 0 });
      cursor += 1;
    }
  }

  const minX = Math.min(...Array.from(positions.values()).map((position) => position.x), 0);
  const maxX = Math.max(...Array.from(positions.values()).map((position) => position.x), 0);
  const offsetX = -((minX + maxX) / 2);

  const nodes: Node[] = employeeIds.map((id) => {
    const employee = employees[id];
    const position = positions.get(id) || { x: 0, y: 0 };
    return {
      data: {
        label: `${employee.name}\n${employee.title}`,
      },
      draggable: false,
      id,
      position: { x: position.x + offsetX, y: position.y },
      type: "default",
    };
  });

  const edges: Edge[] = (orgChart?.edges || []).map(([source, target]) => ({
    animated: employees[target]?.status !== "active",
    id: `${source}->${target}`,
    source,
    target,
  }));

  return { edges, nodes };
}

function defaultEmployeeDraft(parentId: string, employeeCount: number): TaskFlowEmployeeDraft {
  const isRoot = parentId === ROOT_CREATE_ID || (!parentId && employeeCount === 0);
  return {
    allowed_tools: [],
    body: isRoot
      ? "Owns Task Flow decomposition, routing, dependency control, review escalation, and creation of the first discipline-specific employees."
      : "",
    can_use_subagents: isRoot,
    id: isRoot ? "cto" : "",
    manager_id: parentId === ROOT_CREATE_ID ? null : parentId || null,
    name: isRoot ? "CTO" : "",
    role: isRoot ? "executive_orchestrator" : "specialist",
    status: "active",
    subagent_allowlist: [],
    title: isRoot ? "Technical Director" : "",
  };
}

function employeeToDraft(employee: TaskFlowEmployee | null | undefined): TaskFlowEmployeeDraft | null {
  if (!employee) {
    return null;
  }
  return {
    allowed_tools: employee.allowed_tools || [],
    body: employee.body || "",
    can_use_subagents: Boolean(employee.can_use_subagents),
    id: employee.id,
    manager_id: employee.manager_id || null,
    name: employee.name,
    role: employee.role,
    status: employee.status === "disabled" || employee.status === "archived" ? employee.status : "active",
    subagent_allowlist: employee.subagent_allowlist || [],
    title: employee.title,
  };
}

function parseCsv(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function slugifyEmployeeId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
