export const automationsKeys = {
  detail: (profileId: string, automationId: number) => ["automations", profileId, "detail", automationId] as const,
  detailRoot: (profileId: string) => ["automations", profileId, "detail"] as const,
  graph: (profileId: string, automationId: number) => ["automations", profileId, "graph", automationId] as const,
  graphRoot: (profileId: string) => ["automations", profileId, "graph"] as const,
  endpoint: (profileId: string, automationId: number) => ["automations", profileId, "webhook-endpoint", automationId] as const,
  endpointRoot: (profileId: string) => ["automations", profileId, "webhook-endpoint"] as const,
  list: (
    profileId: string,
    filters: {
      includeDeleted: boolean;
      query: string;
      status: string;
      triggerType: string;
    },
  ) => ["automations", profileId, "list", filters] as const,
  listRoot: (profileId: string) => ["automations", profileId, "list"] as const,
};
