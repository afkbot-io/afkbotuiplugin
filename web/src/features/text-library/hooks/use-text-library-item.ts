import { useQuery } from "@tanstack/react-query";

import { textLibraryKeys } from "@/features/text-library/model/text-library.query-keys";
import type { TextLibraryDefinition } from "@/features/text-library/model/text-library.types";

export function useTextLibraryItem({
  active,
  api,
  definition,
  itemId,
  profileId,
}: {
  active: boolean;
  api: unknown;
  definition: TextLibraryDefinition;
  itemId: string;
  profileId: string;
}) {
  return useQuery({
    enabled: Boolean(active && profileId && itemId),
    queryFn: async () => definition.get(api, profileId, itemId),
    queryKey: textLibraryKeys.detail(definition.entity, profileId, itemId),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 30_000,
  });
}
