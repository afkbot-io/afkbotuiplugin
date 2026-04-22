import { useQuery } from "@tanstack/react-query";

import { getAutomation } from "@/features/automations/model/automations.api";
import { automationsKeys } from "@/features/automations/model/automations.query-keys";

export function useAutomationDetail({
  active,
  api,
  automationId,
  enabled = true,
  profileId,
}: {
  active: boolean;
  api: unknown;
  automationId: number | null;
  enabled?: boolean;
  profileId: string;
}) {
  return useQuery({
    enabled: Boolean(active && enabled && profileId && automationId !== null),
    queryFn: async () => getAutomation(api, profileId, automationId as number),
    queryKey: automationsKeys.detail(profileId, automationId as number),
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 0,
  });
}
