import { describe, expect, it } from "vitest";

import {
  checkReleaseContract,
  readSourceMounts,
  validateArtifactIgnore,
  validateSourceMounts,
  validateVersionSync,
} from "../scripts/check-release-contract.mjs";

describe("release contract", () => {
  it("keeps plugin manifest, docs, and built dist in sync", () => {
    expect(() => checkReleaseContract()).not.toThrow();
  });

  it("fails when version surfaces drift", () => {
    expect(() =>
      validateVersionSync({
        changelogVersion: "0.5.0",
        manifestVersion: "0.5.1",
        packageVersion: "0.5.1",
        readmeVersion: "0.5.1",
      }),
    ).toThrow("Top changelog entry 0.5.0 does not match manifest version 0.5.1.");
  });

  it("parses and validates source mounts against the manifest", () => {
    const html = '<body data-api-base="/v1/plugins/afkbotui" data-web-base="/plugins/afkbotui">';
    expect(readSourceMounts(html)).toEqual({
      apiBase: "/v1/plugins/afkbotui",
      webBase: "/plugins/afkbotui",
    });
    expect(() =>
      validateSourceMounts({
        apiPrefix: "/v1/plugins/afkbotui",
        indexHtml: html,
        webPrefix: "/plugins/afkbotui",
      }),
    ).not.toThrow();
    expect(() =>
      validateSourceMounts({
        apiPrefix: "/v1/plugins/afkbotui",
        indexHtml: '<body data-api-base="/v1/plugins/other" data-web-base="/plugins/afkbotui">',
        webPrefix: "/plugins/afkbotui",
      }),
    ).toThrow("web/index.html data-api-base /v1/plugins/other does not match manifest api prefix /v1/plugins/afkbotui.");
  });

  it("requires expected artifact paths in .gitignore", () => {
    expect(() =>
      validateArtifactIgnore(["output/", "web/coverage/"], "output/\nweb/coverage/\n"),
    ).not.toThrow();
    expect(() =>
      validateArtifactIgnore([".pytest_cache/"], "output/\n"),
    ).toThrow(".gitignore is missing .pytest_cache/.");
  });
});
