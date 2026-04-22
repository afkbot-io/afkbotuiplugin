import { normalizeError } from "@/shared/lib/workspace";

export function resolveTextLibraryErrorMessage(error: unknown, profileFallbackMessage = "") {
  if ((error as { code?: string } | null)?.code === "profile_not_found") {
    return profileFallbackMessage || "Selected profile is not available in this workspace yet.";
  }
  return normalizeError(error);
}
