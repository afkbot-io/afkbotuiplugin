import { useMutation, useQueryClient } from "@tanstack/react-query";

import { resolveTextLibraryErrorMessage } from "@/features/text-library/model/text-library.errors";
import { textLibraryKeys } from "@/features/text-library/model/text-library.query-keys";
import type { TextLibraryDefinition, TextLibraryDraft, TextLibraryItem } from "@/features/text-library/model/text-library.types";

export function useTextLibraryMutations({
  api,
  definition,
  profileId,
}: {
  api: unknown;
  definition: TextLibraryDefinition;
  profileId: string;
}) {
  const queryClient = useQueryClient();

  const invalidateFamily = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: textLibraryKeys.listRoot(definition.entity, profileId),
      }),
      queryClient.invalidateQueries({
        queryKey: textLibraryKeys.detailRoot(definition.entity, profileId),
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (draft: TextLibraryDraft) => definition.create(api, profileId, draft),
    onSuccess: async (item) => {
      queryClient.setQueryData(textLibraryKeys.detail(definition.entity, profileId, item.id), item);
      await invalidateFamily();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ draft, item }: { draft: TextLibraryDraft; item: TextLibraryItem }) =>
      definition.update(api, profileId, item, draft),
    onSuccess: async (nextItem, { item }) => {
      queryClient.removeQueries({
        queryKey: textLibraryKeys.detail(definition.entity, profileId, item.id),
      });
      queryClient.setQueryData(textLibraryKeys.detail(definition.entity, profileId, nextItem.id), nextItem);
      await invalidateFamily();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: TextLibraryItem) => {
      await definition.remove(api, profileId, item);
      return item;
    },
    onSuccess: async (item) => {
      queryClient.removeQueries({
        queryKey: textLibraryKeys.detail(definition.entity, profileId, item.id),
      });
      await invalidateFamily();
    },
  });

  return {
    createMutation,
    deleteMutation,
    resolveErrorMessage(error: unknown) {
      return resolveTextLibraryErrorMessage(error, definition.ui.profileMissingDescription?.(profileId));
    },
    updateMutation,
  };
}
