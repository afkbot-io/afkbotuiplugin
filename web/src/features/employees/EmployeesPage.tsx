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
  getTaskFlowOrgChart,
  listTaskFlowEmployees,
  resolveTaskFlowError,
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

  const refresh = async () => {
    await Promise.all([employeesQuery.refetch(), orgChartQuery.refetch()]);
  };

  useImperativeHandle(ref, () => ({ refresh }), [employeesQuery, orgChartQuery]);

  const orgChart = orgChartQuery.data || null;
  const employeeRows = useMemo(() => buildEmployeeRows(orgChart), [orgChart]);
  const graph = useMemo(() => buildGraph(orgChart, layoutMode), [orgChart, layoutMode]);
  const selectedEmployee = selectedEmployeeId ? orgChart?.employees[selectedEmployeeId] || null : null;
  const createParent = createParentId && createParentId !== ROOT_CREATE_ID ? orgChart?.employees[createParentId] || null : null;
  const defaultCreateParentId = employeeRows.some((employee) => employee.id === "cto") ? "cto" : ROOT_CREATE_ID;
  const loading = (employeesQuery.isFetching && !employeesQuery.data) || (orgChartQuery.isFetching && !orgChart);
  const error = employeesQuery.error || orgChartQuery.error;

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

      <EmployeeDetailsModal employee={selectedEmployee} onClose={() => setSelectedEmployeeId("")} />
      <CreateEmployeeModal
        busy={createEmployeeMutation.isPending}
        employeeCount={employeeRows.length}
        onClose={() => setCreateParentId("")}
        onSubmit={(draft) => createEmployeeMutation.mutate(draft)}
        parent={createParent}
        parentId={createParentId}
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

function EmployeeDetailsModal({ employee, onClose }: { employee: TaskFlowEmployee | null | undefined; onClose: () => void }) {
  if (!employee) {
    return null;
  }
  return (
    <ModalDialog closeLabel="Close employee details" eyebrow={employee.id} onClose={onClose} open title={employee.name} wide>
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
      </div>
    </ModalDialog>
  );
}

function CreateEmployeeModal({
  busy,
  employeeCount,
  onClose,
  onSubmit,
  parent,
  parentId,
}: {
  busy: boolean;
  employeeCount: number;
  onClose: () => void;
  onSubmit: (draft: TaskFlowEmployeeDraft) => void;
  parent: TaskFlowEmployee | null | undefined;
  parentId: string;
}) {
  const [draft, setDraft] = useState(() => defaultEmployeeDraft(parentId, employeeCount));
  useEffect(() => {
    setDraft(defaultEmployeeDraft(parentId, employeeCount));
  }, [employeeCount, parentId]);

  if (!parentId) {
    return null;
  }
  const update = (patch: Partial<TaskFlowEmployeeDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ ...draft, manager_id: parentId === ROOT_CREATE_ID ? null : parentId });
  };

  return (
    <ModalDialog
      busy={busy}
      closeLabel="Close employee creation"
      description={parent ? `Reports to ${parent.name}` : "Root employee for this profile"}
      eyebrow="New Employee"
      onClose={onClose}
      open={Boolean(parentId)}
      title="Create Employee"
      wide
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="form-grid form-grid--two">
          <label className="field">
            <span>ID</span>
            <input
              disabled={busy}
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
                update({ id: slugifyEmployeeId(name), name, title: draft.title || name });
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
        </div>
        <label className="field">
          <span>Description</span>
          <textarea disabled={busy} onChange={(event) => update({ body: event.target.value })} rows={6} value={draft.body || ""} />
        </label>
        <div className="modal-actions">
          <button className="button button--ghost" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button button--primary" disabled={busy || !draft.id || !draft.name || !draft.title || !draft.role} type="submit">
            Create
          </button>
        </div>
      </form>
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
    subagent_allowlist: [],
    title: isRoot ? "Technical Director" : "",
  };
}

function slugifyEmployeeId(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
