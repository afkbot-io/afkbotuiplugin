import { useQuery } from "@tanstack/react-query";

import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";

export function useTextLibraryList({
  active,
  api,
  definition,
  profileId,
  query,
}: {
  active: boolean;
  api: unknown;
  definition: TextLibraryDefinition;
  profileId: string;
  query: string;
}) {
  return useQuery({
    enabled: Boolean(active && profileId),
    placeholderData: (previousData) => previousData,
    queryFn: async () => definition.list(api, profileId, query),
    queryKey: ["text-library", definition.entity, profileId, "list", query],
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });
}
