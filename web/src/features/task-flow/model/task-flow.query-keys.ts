export const taskFlowQueryKeys = {
  all: ["task-flow"] as const,
  board: (profileId: string, flowId: string, limitPerColumn: number) =>
    [...taskFlowQueryKeys.all, profileId, "board", flowId || "all", limitPerColumn] as const,
  detail: (profileId: string, taskId: string) => [...taskFlowQueryKeys.all, profileId, "detail", taskId] as const,
  context: (profileId: string, taskId: string) => [...taskFlowQueryKeys.all, profileId, "context", taskId] as const,
  documents: (profileId: string, scopeType: string, scopeId: string) =>
    [...taskFlowQueryKeys.all, profileId, "documents", scopeType, scopeId] as const,
  projects: (profileId: string) => [...taskFlowQueryKeys.all, profileId, "projects"] as const,
  review: (profileId: string, flowId: string, actorType: string, actorRef: string) =>
    [...taskFlowQueryKeys.all, profileId, "review", flowId || "all", actorType, actorRef] as const,
  session: (profileId: string, taskId: string) => [...taskFlowQueryKeys.all, profileId, "session", taskId] as const,
  employees: (profileId: string) => [...taskFlowQueryKeys.all, profileId, "employees"] as const,
  team: (profileId: string) => [...taskFlowQueryKeys.all, profileId, "team"] as const,
};
