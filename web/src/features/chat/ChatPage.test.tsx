import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/app/AppProviders";
import { ChatPage } from "@/features/chat/ChatPage";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  private listeners: Record<string, Array<(event: { data?: string }) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    window.setTimeout(() => {
      this.emit("open", {});
      this.emit("message", {
        data: JSON.stringify({
          cursor: { last_event_id: 1, run_id: 7 },
          events: [
            {
              created_at: "2026-04-21T12:20:00.000Z",
              event_id: 1,
              event_type: "turn.finalized",
              payload: { summary: "WS complete" },
              tool_name: "agent-loop",
            },
          ],
        }),
      });
    }, 0);
  }

  addEventListener(type: string, callback: (event: { data?: string }) => void) {
    this.listeners[type] = [...(this.listeners[type] || []), callback];
  }

  close() {
    this.emit("close", {});
  }

  private emit(type: string, event: { data?: string }) {
    for (const callback of this.listeners[type] || []) {
      callback(event);
    }
  }
}

function renderChat(api: Record<string, unknown>) {
  return render(
    <AppProviders>
      <ChatPage active api={api} config={{}} navigateToRoute={vi.fn()} notify={vi.fn()} profileId="default" profiles={[]} updateConfig={vi.fn()} />
    </AppProviders>,
  );
}

describe("ChatPage", () => {
  beforeEach(() => {
    document.body.dataset.apiBase = "/v1/plugins/afkbotui";
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a turn and streams progress over the plugin WebSocket endpoint", async () => {
    const user = userEvent.setup();
    const api = {
      getChatHistory: vi.fn(async () => ({
        profile_id: "default",
        session_id: "ui-default",
        turns: [
          {
            assistant_message: "Ready.",
            id: 1,
            profile_id: "default",
            session_id: "ui-default",
            user_message: "Check workspace.",
          },
        ],
      })),
      getChatProgress: vi.fn(async () => ({ cursor: {}, events: [] })),
      sendChatTurn: vi.fn(async () => ({
        envelope: { action: "finalize", message: "Done." },
        profile_id: "default",
        run_id: 7,
        session_id: "ui-default",
      })),
    };

    renderChat(api);

    await screen.findByText("Ready.");
    await user.type(screen.getByLabelText("Message AFKBOT"), "Plan UI QA");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(api.sendChatTurn).toHaveBeenCalledWith(expect.objectContaining({ message: "Plan UI QA" }));
      expect(FakeWebSocket.instances[0]?.url).toContain("/v1/plugins/afkbotui/chat/progress/ws");
    });
    expect(await screen.findByText("WS complete")).toBeInTheDocument();
  });

  it("renders ask_question envelopes and resumes with the user answer", async () => {
    const user = userEvent.setup();
    const api = {
      answerChatQuestion: vi.fn(async () => ({ envelope: { action: "finalize", message: "Answered." } })),
      getChatHistory: vi.fn(async () => ({ profile_id: "default", session_id: "ui-default", turns: [] })),
      getChatProgress: vi.fn(async () => ({ cursor: {}, events: [] })),
      sendChatTurn: vi.fn(async () => ({
        envelope: {
          action: "ask_question",
          message: "Approve local tool use?",
          question_id: "q-1",
        },
        profile_id: "default",
        session_id: "ui-default",
      })),
    };

    renderChat(api);

    await user.type(await screen.findByLabelText("Message AFKBOT"), "Run guarded tool");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Agent needs your answer")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Answer agent question"), "Approved for this run.");
    await user.click(screen.getByRole("button", { name: "Send Answer" }));

    await waitFor(() => {
      expect(api.answerChatQuestion).toHaveBeenCalledWith(expect.objectContaining({
        answer: "Approved for this run.",
        question_id: "q-1",
      }));
    });
  });

  it("submits secure field envelopes without persisting the secret in chat history", async () => {
    const user = userEvent.setup();
    const api = {
      getChatHistory: vi.fn(async () => ({ profile_id: "default", session_id: "ui-default", turns: [] })),
      getChatProgress: vi.fn(async () => ({ cursor: {}, events: [] })),
      sendChatTurn: vi.fn(async () => ({
        envelope: {
          action: "request_secure_field",
          message: "Paste API token.",
          question_id: "q-secure",
          secure_field: "OPENAI_API_KEY",
        },
        profile_id: "default",
        session_id: "ui-default",
      })),
      submitChatSecureField: vi.fn(async () => ({
        error_code: "",
        next_turn: { envelope: { action: "finalize", message: "Secret accepted." } },
        ok: true,
      })),
    };

    renderChat(api);

    await user.type(await screen.findByLabelText("Message AFKBOT"), "Configure provider");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Secure value required: OPENAI_API_KEY")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Secure value"), "sk-test-secret");
    await user.click(screen.getByRole("button", { name: "Submit Secure Value" }));

    await waitFor(() => {
      expect(api.submitChatSecureField).toHaveBeenCalledWith(expect.objectContaining({
        question_id: "q-secure",
        secret_value: "sk-test-secret",
      }));
    });
    expect(screen.queryByText("sk-test-secret")).not.toBeInTheDocument();
  });
});
