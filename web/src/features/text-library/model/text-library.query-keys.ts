import type { TextLibraryEntity } from "@/features/text-library/model/text-library.types";

export const textLibraryKeys = {
  detail(entity: TextLibraryEntity, profileId: string, itemId: string) {
    return ["text-library", entity, profileId, "detail", itemId] as const;
  },
  detailRoot(entity: TextLibraryEntity, profileId: string) {
    return ["text-library", entity, profileId, "detail"] as const;
  },
  family(entity: TextLibraryEntity, profileId: string) {
    return ["text-library", entity, profileId] as const;
  },
  list(entity: TextLibraryEntity, profileId: string, query: string) {
    return ["text-library", entity, profileId, "list", query] as const;
  },
  listRoot(entity: TextLibraryEntity, profileId: string) {
    return ["text-library", entity, profileId, "list"] as const;
  },
};
