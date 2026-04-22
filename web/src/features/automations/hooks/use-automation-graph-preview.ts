import { useQuery } from "@tanstack/react-query";

import { getAutomationGraphPreview } from "@/features/automations/model/automations.api";
import { automationsKeys } from "@/features/automations/model/automations.query-keys";

export function useAutomationGraphPreview({
  active,
  api,
  automationId,
  enabled,
  profileId,
}: {
  active: boolean;
  api: unknown;
  automationId: number | null;
  enabled: boolean;
  profileId: string;
}) {
  return useQuery({
    enabled: Boolean(active && enabled && profileId && automationId !== null),
    queryFn: async () => getAutomationGraphPreview(api, profileId, automationId as number),
    queryKey: automationsKeys.graph(profileId, automationId as number),
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 60_000,
  });
}
