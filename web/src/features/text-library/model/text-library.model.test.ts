import { describe, expect, it } from "vitest";

import { resolveTextLibraryErrorMessage } from "@/features/text-library/model/text-library.errors";
import { textLibraryKeys } from "@/features/text-library/model/text-library.query-keys";

describe("text-library model helpers", () => {
  it("builds stable query keys for family, list, and detail scopes", () => {
    expect(textLibraryKeys.family("skills", "default")).toEqual(["text-library", "skills", "default"]);
    expect(textLibraryKeys.listRoot("skills", "default")).toEqual(["text-library", "skills", "default", "list"]);
    expect(textLibraryKeys.list("skills", "default", "agent")).toEqual([
      "text-library",
      "skills",
      "default",
      "list",
      "agent",
    ]);
    expect(textLibraryKeys.detailRoot("skills", "default")).toEqual(["text-library", "skills", "default", "detail"]);
    expect(textLibraryKeys.detail("skills", "default", "alpha")).toEqual([
      "text-library",
      "skills",
      "default",
      "detail",
      "alpha",
    ]);
  });

  it("maps profile_not_found to the friendly fallback and keeps generic error messages for other errors", () => {
    expect(
      resolveTextLibraryErrorMessage(
        {
          code: "profile_not_found",
        },
        'Skills are unavailable because the profile "blue" is not available.',
      ),
    ).toBe('Skills are unavailable because the profile "blue" is not available.');

    expect(resolveTextLibraryErrorMessage(new Error("boom"))).toBe("boom");
  });
});
