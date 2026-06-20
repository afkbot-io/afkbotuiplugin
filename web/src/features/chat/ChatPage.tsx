import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import type { AppRouteProps, RouteHandle } from "@/app/routes";
import type { ApiClient } from "@/shared/api/client";
import { normalizeError } from "@/shared/lib/workspace";

type ChatTurn = {
  assistant_message?: string | null;
  id?: number | null;
  profile_id?: string | null;
  session_id?: string | null;
  user_message?: string | null;
};

type ChatEnvelope = {
  action?: "ask_question" | "request_secure_field" | "update_spec" | "block" | "finalize" | string;
  blocked_reason?: string | null;
  message?: string | null;
  question_id?: string | null;
  secure_field?: string | null;
  spec_patch?: Record<string, unknown> | null;
};

type ChatTurnResult = {
  envelope?: ChatEnvelope | null;
  profile_id?: string | null;
  run_id?: number | null;
  session_id?: string | null;
};

type ChatProgressEvent = {
  created_at?: string | null;
  event_id?: number | null;
  event_type?: string | null;
  payload?: Record<string, unknown> | null;
  stage?: string | null;
  tool_name?: string | null;
};

type ProgressCursor = {
  last_event_id?: number | null;
  run_id?: number | null;
};

const CHAT_SESSION_STORAGE_PREFIX = "afkbotui:chat-session:";

export const ChatPage = forwardRef<RouteHandle, AppRouteProps>(function ChatPage(
  {
    active = true,
    api,
    notify,
    profileId,
  },
  ref,
) {
  const client = api as ApiClient;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState(() => readChatSessionId(profileId));
  const [pendingEnvelope, setPendingEnvelope] = useState<ChatEnvelope | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [secureDraft, setSecureDraft] = useState("");
  const [runId, setRunId] = useState<number | null>(null);
  const [progressCursor, setProgressCursor] = useState<ProgressCursor>({});
  const [streamedProgress, setStreamedProgress] = useState<ReturnType<typeof normalizeProgress> | null>(null);
  const [progressSocketReady, setProgressSocketReady] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState("");
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(readChatSessionId(profileId));
    setPendingEnvelope(null);
    setRunId(null);
    setProgressCursor({});
    setStreamedProgress(null);
    setProgressSocketReady(false);
    setOptimisticMessage("");
  }, [profileId]);

  useEffect(() => {
    writeChatSessionId(profileId, sessionId);
  }, [profileId, sessionId]);

  const historyQuery = useQuery({
    enabled: active && Boolean(profileId && sessionId),
    queryKey: ["chat", "history", profileId, sessionId],
    queryFn: async () => {
      const response = await client.getChatHistory(profileId, sessionId, { limit: 80 });
      return normalizeHistory(response);
    },
    refetchOnWindowFocus: false,
  });

  const progressQuery = useQuery({
    enabled: active && Boolean(profileId && sessionId && runId && !progressSocketReady),
    queryKey: ["chat", "progress", profileId, sessionId, runId, progressCursor.last_event_id || 0],
    queryFn: async () => {
      const response = await client.getChatProgress(profileId, sessionId, {
        after_event_id: progressCursor.last_event_id || 0,
        limit: 40,
        run_id: runId || undefined,
      });
      return normalizeProgress(response);
    },
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const cursor = progressQuery.data?.cursor;
    if (cursor?.last_event_id && cursor.last_event_id !== progressCursor.last_event_id) {
      setProgressCursor(cursor);
    }
  }, [progressCursor.last_event_id, progressQuery.data?.cursor]);

  useEffect(() => {
    if (!active || !profileId || !sessionId || !runId || typeof WebSocket === "undefined") {
      setProgressSocketReady(false);
      return;
    }

    let closedByEffect = false;
    const socket = new WebSocket(buildProgressSocketUrl(profileId, sessionId, runId, 0));
    socket.addEventListener("open", () => {
      if (!closedByEffect) {
        setProgressSocketReady(true);
      }
    });
    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data || "{}")) as Record<string, unknown>;
        const progress = normalizeProgress(payload);
        setStreamedProgress(progress);
        if (progress.cursor.last_event_id) {
          setProgressCursor(progress.cursor);
        }
      } catch {
        // Ignore malformed progress frames; HTTP polling remains available as a fallback.
      }
    });
    socket.addEventListener("error", () => {
      if (!closedByEffect) {
        setProgressSocketReady(false);
      }
    });
    socket.addEventListener("close", () => {
      if (!closedByEffect) {
        setProgressSocketReady(false);
      }
    });
    return () => {
      closedByEffect = true;
      setProgressSocketReady(false);
      socket.close();
    };
  }, [active, profileId, runId, sessionId]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await client.sendChatTurn({
        client_msg_id: makeClientMessageId(),
        message,
        profile_id: profileId,
        session_id: sessionId,
      });
      return normalizeTurnResult(response);
    },
    onSuccess(result) {
      if (result.session_id) {
        setSessionId(result.session_id);
      }
      if (result.run_id) {
        setRunId(result.run_id);
      }
      setOptimisticMessage("");
      setPendingEnvelope(isInteractiveEnvelope(result.envelope) ? result.envelope || null : null);
      queryClient.invalidateQueries({ queryKey: ["chat", "history", profileId, result.session_id || sessionId] });
    },
    onError(error) {
      setOptimisticMessage("");
      notify(normalizeError(error), "danger");
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (answer: { approved?: boolean; text?: string }) => {
      if (!pendingEnvelope?.question_id) {
        throw new Error("Pending question is no longer available.");
      }
      const response = await client.answerChatQuestion({
        answer: answer.text,
        approved: answer.approved,
        client_msg_id: makeClientMessageId(),
        profile_id: profileId,
        question_id: pendingEnvelope.question_id,
        session_id: sessionId,
      });
      return normalizeTurnResult(response);
    },
    onSuccess(result) {
      if (result.run_id) {
        setRunId(result.run_id);
      }
      setAnswerDraft("");
      setPendingEnvelope(isInteractiveEnvelope(result.envelope) ? result.envelope || null : null);
      queryClient.invalidateQueries({ queryKey: ["chat", "history", profileId, sessionId] });
    },
    onError(error) {
      notify(normalizeError(error), "danger");
    },
  });

  const secureMutation = useMutation({
    mutationFn: async (secretValue: string) => {
      if (!pendingEnvelope?.question_id || !pendingEnvelope.secure_field) {
        throw new Error("Secure request is no longer available.");
      }
      const response = await client.submitChatSecureField({
        client_msg_id: makeClientMessageId(),
        profile_id: profileId,
        question_id: pendingEnvelope.question_id,
        resume_after_submit: true,
        secret_value: secretValue,
        secure_field: pendingEnvelope.secure_field,
        session_id: sessionId,
      });
      return normalizeSecureResponse(response);
    },
    onSuccess(result) {
      setSecureDraft("");
      const nextTurn = result.next_turn;
      if (nextTurn?.run_id) {
        setRunId(nextTurn.run_id);
      }
      setPendingEnvelope(isInteractiveEnvelope(nextTurn?.envelope) ? nextTurn?.envelope || null : null);
      if (!result.ok) {
        notify(`Secure value was not accepted: ${result.error_code || "unknown error"}`, "danger");
      }
      queryClient.invalidateQueries({ queryKey: ["chat", "history", profileId, sessionId] });
    },
    onError(error) {
      notify(normalizeError(error), "danger");
    },
  });

  const refreshAll = useCallback(async () => {
    await historyQuery.refetch();
    if (runId) {
      await progressQuery.refetch();
    }
  }, [historyQuery, progressQuery, runId]);

  useImperativeHandle(ref, () => ({ refresh: refreshAll }), [refreshAll]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const element = transcriptRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [active, historyQuery.data?.turns.length, pendingEnvelope, sendMutation.isPending]);

  const turns = historyQuery.data?.turns || [];
  const progressEvents = streamedProgress?.events || progressQuery.data?.events || [];
  const isBusy = sendMutation.isPending || answerMutation.isPending || secureMutation.isPending;
  const empty = !historyQuery.isLoading && turns.length === 0;
  const canSend = Boolean(draft.trim()) && !isBusy;

  const pendingSummary = useMemo(() => {
    if (!pendingEnvelope) {
      return "";
    }
    if (pendingEnvelope.action === "request_secure_field") {
      return pendingEnvelope.secure_field ? `Secure value required: ${pendingEnvelope.secure_field}` : "Secure value required";
    }
    if (pendingEnvelope.action === "ask_question") {
      return "Agent needs your answer";
    }
    return pendingEnvelope.action || "Agent response";
  }, [pendingEnvelope]);

  return (
    <article className="route-page route-page--chat">
      <header className="chat-header">
        <div>
          <p className="chat-header__eyebrow">Native Agent</p>
          <h1>Chat</h1>
          <p className="chat-header__copy">Work with AFKBOT through the local runtime, tools, memory, and profile policy.</p>
        </div>
        <div className="chat-session-card">
          <span>Profile</span>
          <strong>{profileId || "default"}</strong>
          <span>Session</span>
          <input
            aria-label="Chat session id"
            className="chat-session-card__input"
            maxLength={64}
            onChange={(event) => setSessionId(event.target.value.trim() || defaultChatSessionId(profileId))}
            value={sessionId}
          />
        </div>
      </header>

      <div className="chat-layout">
        <section className="chat-panel" aria-label="AFKBOT chat transcript">
          <div className="chat-transcript" ref={transcriptRef}>
            {historyQuery.isLoading ? <div className="chat-system-card">Loading chat history…</div> : null}
            {historyQuery.error ? <div className="inline-alert inline-alert--danger">{normalizeError(historyQuery.error)}</div> : null}
            {empty ? (
              <div className="chat-empty">
                <p className="chat-empty__kicker">Ready</p>
                <h2>What should AFKBOT do?</h2>
                <p>Start a focused session, ask for a plan, or hand off work into Task Flow when it needs durable tracking.</p>
              </div>
            ) : null}
            {turns.map((turn) => (
              <div className="chat-turn" key={turn.id || `${turn.session_id}-${turn.user_message}`}>
                <MessageBubble author="You" kind="user" text={turn.user_message || ""} />
                <MessageBubble author="AFKBOT" kind="assistant" text={turn.assistant_message || ""} />
              </div>
            ))}
            {sendMutation.isPending ? (
              <div className="chat-turn chat-turn--pending">
                <MessageBubble author="You" kind="user" text={optimisticMessage || draft.trim()} />
                <div className="chat-bubble chat-bubble--assistant chat-bubble--thinking">
                  <span className="chat-bubble__author">AFKBOT</span>
                  <span className="chat-thinking-dot" />
                  <span className="chat-thinking-dot" />
                  <span className="chat-thinking-dot" />
                </div>
              </div>
            ) : null}
            {pendingEnvelope && !sendMutation.isPending ? (
              <section className="chat-interaction-card" aria-label={pendingSummary}>
                <div>
                  <p className="chat-interaction-card__eyebrow">{pendingSummary}</p>
                  <p>{pendingEnvelope.message || "The agent is waiting for input."}</p>
                </div>
                {pendingEnvelope.action === "ask_question" ? (
                  <form
                    className="chat-interaction-card__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      answerMutation.mutate({ text: answerDraft.trim() || undefined });
                    }}
                  >
                    <textarea
                      aria-label="Answer agent question"
                      className="textarea"
                      onChange={(event) => setAnswerDraft(event.target.value)}
                      placeholder="Answer…"
                      value={answerDraft}
                    />
                    <div className="chat-interaction-card__actions">
                      <button
                        className="button button--ghost"
                        disabled={answerMutation.isPending}
                        onClick={() => answerMutation.mutate({ approved: false, text: answerDraft.trim() || undefined })}
                        type="button"
                      >
                        Decline
                      </button>
                      <button className="button button--primary" disabled={answerMutation.isPending} type="submit">
                        Send Answer
                      </button>
                    </div>
                  </form>
                ) : null}
                {pendingEnvelope.action === "request_secure_field" ? (
                  <form
                    className="chat-interaction-card__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (secureDraft.trim()) {
                        secureMutation.mutate(secureDraft);
                      }
                    }}
                  >
                    <input
                      aria-label="Secure value"
                      autoComplete="off"
                      className="input"
                      onChange={(event) => setSecureDraft(event.target.value)}
                      placeholder="Paste secure value"
                      type="password"
                      value={secureDraft}
                    />
                    <button className="button button--primary" disabled={!secureDraft.trim() || secureMutation.isPending} type="submit">
                      Submit Secure Value
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}
          </div>

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              const message = draft.trim();
              if (!message || sendMutation.isPending) {
                return;
              }
              setOptimisticMessage(message);
              sendMutation.mutate(message);
              setDraft("");
            }}
          >
            <textarea
              aria-label="Message AFKBOT"
              className="chat-composer__input"
              disabled={isBusy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const form = event.currentTarget.form;
                  form?.requestSubmit();
                }
              }}
              placeholder="Message AFKBOT…"
              rows={1}
              value={draft}
            />
            <button className="chat-composer__send" disabled={!canSend} type="submit">
              Send
            </button>
          </form>
        </section>

        <aside className="chat-side-panel" aria-label="Agent runtime details">
          <section className="chat-side-panel__section">
            <p className="chat-side-panel__eyebrow">Runtime</p>
            <h2>Agent Session</h2>
            <dl className="chat-meta-list">
              <div>
                <dt>Profile</dt>
                <dd>{profileId || "default"}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{sessionId}</dd>
              </div>
              <div>
                <dt>Run</dt>
                <dd>{runId || "idle"}</dd>
              </div>
            </dl>
          </section>
          <section className="chat-side-panel__section">
            <p className="chat-side-panel__eyebrow">Progress</p>
            <div className="chat-progress-list">
              {progressEvents.length ? (
                progressEvents.map((event) => (
                  <div className="chat-progress-item" key={event.event_id || `${event.event_type}-${event.created_at}`}>
                    <span>{event.event_type || "event"}</span>
                    <strong>{event.tool_name || event.stage || "runtime"}</strong>
                    <p>{eventSummary(event)}</p>
                  </div>
                ))
              ) : (
                <p className="muted">Runtime events will appear while the agent works.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
});

function MessageBubble({ author, kind, text }: { author: string; kind: "assistant" | "user"; text: string }) {
  return (
    <div className={`chat-bubble chat-bubble--${kind}`}>
      <span className="chat-bubble__author">{author}</span>
      <p>{text || "No message content."}</p>
    </div>
  );
}

function normalizeHistory(payload: Record<string, unknown>) {
  return {
    profileId: String(payload.profile_id || ""),
    sessionId: String(payload.session_id || ""),
    turns: Array.isArray(payload.turns) ? (payload.turns as ChatTurn[]) : [],
  };
}

function normalizeProgress(payload: Record<string, unknown>) {
  return {
    cursor: (payload.cursor && typeof payload.cursor === "object" ? payload.cursor : {}) as ProgressCursor,
    events: Array.isArray(payload.events) ? (payload.events as ChatProgressEvent[]) : [],
  };
}

function normalizeTurnResult(payload: Record<string, unknown>): ChatTurnResult {
  return {
    envelope: (payload.envelope && typeof payload.envelope === "object" ? payload.envelope : null) as ChatEnvelope | null,
    profile_id: typeof payload.profile_id === "string" ? payload.profile_id : null,
    run_id: typeof payload.run_id === "number" ? payload.run_id : null,
    session_id: typeof payload.session_id === "string" ? payload.session_id : null,
  };
}

function normalizeSecureResponse(payload: Record<string, unknown>) {
  return {
    error_code: typeof payload.error_code === "string" ? payload.error_code : "",
    next_turn: (payload.next_turn && typeof payload.next_turn === "object"
      ? normalizeTurnResult(payload.next_turn as Record<string, unknown>)
      : null),
    ok: Boolean(payload.ok),
  };
}

function isInteractiveEnvelope(envelope: ChatEnvelope | null | undefined) {
  return envelope?.action === "ask_question" || envelope?.action === "request_secure_field";
}

function readChatSessionId(profileId: string) {
  try {
    return window.localStorage.getItem(`${CHAT_SESSION_STORAGE_PREFIX}${profileId || "default"}`) || defaultChatSessionId(profileId);
  } catch {
    return defaultChatSessionId(profileId);
  }
}

function writeChatSessionId(profileId: string, sessionId: string) {
  try {
    window.localStorage.setItem(`${CHAT_SESSION_STORAGE_PREFIX}${profileId || "default"}`, sessionId || defaultChatSessionId(profileId));
  } catch {
    // URL/profile state still keeps the chat usable when storage is blocked.
  }
}

function defaultChatSessionId(profileId: string) {
  const safeProfile = String(profileId || "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
  return `ui-${safeProfile}`.slice(0, 64);
}

function buildProgressSocketUrl(profileId: string, sessionId: string, runId: number, afterEventId: number) {
  const apiBase = document.body.dataset.apiBase || __API_BASE_PATH__;
  const basePath = apiBase.replace(/\/$/, "");
  const url = new URL(`${basePath}/chat/progress/ws`, window.location.origin);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("profile_id", profileId || "default");
  url.searchParams.set("session_id", sessionId || defaultChatSessionId(profileId));
  url.searchParams.set("run_id", String(runId));
  url.searchParams.set("after_event_id", String(Math.max(0, afterEventId || 0)));
  url.searchParams.set("poll_interval_ms", "250");
  return url.toString();
}

function makeClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eventSummary(event: ChatProgressEvent) {
  const payload = event.payload || {};
  const summary = payload.summary || payload.message || payload.reason;
  return typeof summary === "string" && summary.trim() ? summary : event.created_at || "Runtime event";
}
