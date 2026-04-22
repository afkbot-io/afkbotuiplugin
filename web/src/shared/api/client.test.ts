import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient } from "./client";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    status: 200,
  });
}

function errorResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  });
}

describe("ApiClient text-library resources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("supports subagent CRUD endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ subagents: [] }))
      .mockResolvedValueOnce(jsonResponse({ subagent: { name: "builder" } }))
      .mockResolvedValueOnce(jsonResponse({ subagent: { name: "builder" } }))
      .mockResolvedValueOnce(jsonResponse({ subagent: { name: "builder" } }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient("/v1/plugins/afkbotui");

    await client.listSubagents("default", { q: "build" });
    await client.getSubagent("default", "builder");
    await client.createSubagent("default", { markdown: "# builder", name: "builder" });
    await client.updateSubagent("default", "builder", { markdown: "# updated" });
    await client.deleteSubagent("default", "builder");
    const origin = window.location.origin;

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${origin}/v1/plugins/afkbotui/subagents?profile_id=default&q=build`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${origin}/v1/plugins/afkbotui/subagents/builder?profile_id=default`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${origin}/v1/plugins/afkbotui/subagents?profile_id=default`,
      expect.objectContaining({
        body: JSON.stringify({ markdown: "# builder", name: "builder" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `${origin}/v1/plugins/afkbotui/subagents/builder?profile_id=default`,
      expect.objectContaining({
        body: JSON.stringify({ markdown: "# updated" }),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `${origin}/v1/plugins/afkbotui/subagents/builder?profile_id=default`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("supports skill and bootstrap resource endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ skills: [] }))
      .mockResolvedValueOnce(jsonResponse({ skill: { name: "review" } }))
      .mockResolvedValueOnce(jsonResponse({ skill: { name: "review" } }))
      .mockResolvedValueOnce(jsonResponse({ skill: { name: "review" } }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }))
      .mockResolvedValueOnce(jsonResponse({ bootstrap_files: [] }))
      .mockResolvedValueOnce(jsonResponse({ bootstrap_file: { file_name: "AGENTS.md" } }))
      .mockResolvedValueOnce(jsonResponse({ bootstrap_file: { file_name: "AGENTS.md" } }))
      .mockResolvedValueOnce(jsonResponse({ bootstrap_file: { file_name: "AGENTS.md" } }))
      .mockResolvedValueOnce(jsonResponse({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient("/v1/plugins/afkbotui");

    await client.listSkills("default", { q: "review" });
    await client.getSkill("default", "review");
    await client.createSkill("default", { markdown: "# review", name: "review" });
    await client.updateSkill("default", "review", { markdown: "# updated" });
    await client.deleteSkill("default", "review");
    await client.listBootstrapFiles("default", { q: "AGENTS" });
    await client.getBootstrapFile("default", "AGENTS.md");
    await client.createBootstrapFile("default", { content: "# bootstrap", file_name: "AGENTS.md" });
    await client.updateBootstrapFile("default", "AGENTS.md", { content: "# updated", file_name: "AGENTS.md" });
    await client.deleteBootstrapFile("default", "AGENTS.md");
    const origin = window.location.origin;

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${origin}/v1/plugins/afkbotui/skills?profile_id=default&q=review`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      `${origin}/v1/plugins/afkbotui/bootstrap-files?profile_id=default&q=AGENTS`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      10,
      `${origin}/v1/plugins/afkbotui/bootstrap-files/AGENTS.md?profile_id=default`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("supports automation webhook reveal endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ webhook: { webhook_url: "https://example.test/hook" } }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient("/v1/plugins/afkbotui");

    await client.getAutomationWebhookEndpoint(11, "default");
    const origin = window.location.origin;

    expect(fetchMock).toHaveBeenCalledWith(
      `${origin}/v1/plugins/afkbotui/automations/11/webhook-endpoint?profile_id=default`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("invokes onUnauthorized when the auth session probe returns ui_auth_required", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      errorResponse(401, {
        detail: {
          error_code: "ui_auth_required",
          message: "Session expired.",
        },
      }),
    );
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient("/v1/plugins/afkbotui", { onUnauthorized });

    await expect(client.getAuthSession()).rejects.toMatchObject({
      code: "ui_auth_required",
      status: 401,
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
