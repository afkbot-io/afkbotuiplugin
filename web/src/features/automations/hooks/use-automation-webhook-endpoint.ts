import { useQuery } from "@tanstack/react-query";

import { getAutomationWebhookEndpoint } from "@/features/automations/model/automations.api";
import { automationsKeys } from "@/features/automations/model/automations.query-keys";

export function useAutomationWebhookEndpoint({
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
    gcTime: Infinity,
    queryFn: async () => getAutomationWebhookEndpoint(api, profileId, automationId as number),
    queryKey: automationsKeys.endpoint(profileId, automationId as number),
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
}
