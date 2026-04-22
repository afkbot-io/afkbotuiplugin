import { useQuery } from "@tanstack/react-query";

import { listAutomations } from "@/features/automations/model/automations.api";
import { automationsKeys } from "@/features/automations/model/automations.query-keys";
import type { AutomationFilters } from "@/features/automations/model/automations.types";

export function useAutomationsList({
  active,
  api,
  filters,
  profileId,
}: {
  active: boolean;
  api: unknown;
  filters: AutomationFilters;
  profileId: string;
}) {
  return useQuery({
    enabled: Boolean(active && profileId),
    placeholderData: (previousData) => previousData,
    queryFn: async () => listAutomations(api, profileId, filters),
    queryKey: automationsKeys.list(profileId, filters),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });
}
