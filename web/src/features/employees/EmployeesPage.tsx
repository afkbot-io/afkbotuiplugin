import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useImperativeHandle, useMemo } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import {
  getTaskFlowOrgChart,
  listTaskFlowEmployees,
  resolveTaskFlowError,
} from "@/features/task-flow/model/task-flow.api";
import type { TaskFlowEmployee, TaskFlowOrgChart } from "@/features/task-flow/model/task-flow.types";
import { PageHeader } from "@/shared/ui/PageHeader";
import { SurfaceLoader } from "@/shared/ui/SurfaceLoader";

export const EmployeesPage = forwardRef<RouteHandle, AppRouteProps>(function EmployeesPage(
  { active = true, api, profileId },
  ref,
) {
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

  const refresh = async () => {
    await Promise.all([employeesQuery.refetch(), orgChartQuery.refetch()]);
  };

  useImperativeHandle(ref, () => ({ refresh }), [employeesQuery, orgChartQuery]);

  const orgChart = orgChartQuery.data || null;
  const employeeRows = useMemo(() => buildEmployeeRows(orgChart), [orgChart]);
  const graph = useMemo(() => buildGraph(orgChart), [orgChart]);
  const loading = (employeesQuery.isFetching && !employeesQuery.data) || (orgChartQuery.isFetching && !orgChart);
  const error = employeesQuery.error || orgChartQuery.error;

  return (
    <section className="route-page employees-page">
      <PageHeader
        actions={
          <button className="button button--ghost button--compact" onClick={() => void refresh()} type="button">
            Refresh
          </button>
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
                <ReactFlow
                  edges={graph.edges}
                  fitView
                  maxZoom={1.35}
                  minZoom={0.35}
                  nodes={graph.nodes}
                  nodesDraggable={false}
                  nodesFocusable
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={18} size={1} />
                  <MiniMap pannable zoomable />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            ) : (
              <div className="empty-state">
                <h3>No employees configured</h3>
                <p>Create profile employee markdown files to enable Task Flow assignment and employee queues.</p>
              </div>
            )}
          </section>

          <section className="employees-roster glass-panel">
            <div className="panel-head panel-head--compact">
              <div>
                <p className="panel-head__eyebrow">Roster</p>
                <h3 className="panel-head__title">Roles & Permissions</h3>
              </div>
            </div>
            {employeeRows.length ? (
              <div className="employees-roster__list">
                {employeeRows.map((employee) => (
                  <article className="employees-roster__item" key={employee.id}>
                    <div className="flow-manager__item-head">
                      <div>
                        <h4 className="flow-manager__item-title">{employee.name}</h4>
                        <p className="muted">{employee.title} · {employee.role}</p>
                      </div>
                      <span className={employee.status === "active" ? "badge badge--success" : "badge badge--muted"}>
                        {employee.status}
                      </span>
                    </div>
                    <p className="flow-manager__item-copy">{employee.body || "No employee brief yet."}</p>
                    <div className="flow-manager__item-badges">
                      {employee.manager_id ? <span className="badge badge--muted">manager: {employee.manager_id}</span> : null}
                      {employee.reports?.length ? <span className="badge badge--accent">{employee.reports.length} reports</span> : null}
                      {employee.can_delegate_to?.length ? (
                        <span className="badge badge--review">{employee.can_delegate_to.length} delegates</span>
                      ) : null}
                      {employee.allowed_tools?.length ? <span className="badge badge--ai">{employee.allowed_tools.length} tools</span> : null}
                      {employee.can_use_subagents ? <span className="badge badge--live">subagents</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state empty-state--compact">
                <h3>No roster</h3>
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
    </section>
  );
});

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

function buildGraph(orgChart: TaskFlowOrgChart | null): { edges: Edge[]; nodes: Node[] } {
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
  const levels = new Map<string, number>();
  const queue: Array<[string, number]> = effectiveRoots.map((id) => [id, 0]);
  for (const [id, depth] of queue) {
    if (levels.has(id)) {
      continue;
    }
    levels.set(id, depth);
    for (const childId of childrenByParent.get(id) || []) {
      queue.push([childId, depth + 1]);
    }
  }
  for (const id of employeeIds) {
    if (!levels.has(id)) {
      levels.set(id, 0);
    }
  }

  const idsByLevel = new Map<number, string[]>();
  for (const id of employeeIds) {
    const depth = levels.get(id) || 0;
    idsByLevel.set(depth, [...(idsByLevel.get(depth) || []), id]);
  }

  const nodes: Node[] = employeeIds.map((id) => {
    const employee = employees[id];
    const depth = levels.get(id) || 0;
    const peers = idsByLevel.get(depth) || [];
    const index = peers.indexOf(id);
    const x = index * 280 - ((peers.length - 1) * 280) / 2;
    const y = depth * 170;
    return {
      data: {
        label: `${employee.name}\n${employee.title}`,
      },
      id,
      position: { x, y },
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
