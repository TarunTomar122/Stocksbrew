"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import { FOCUS, NUM, fmtAgo } from "@/components/ask/atoms";
import { AskCardView, type CardActions } from "@/components/ask/cards";
import { AskMarkdown } from "@/components/ask/markdown";
import { OaButton } from "@/components/oa/button";
import { isAskCard, type AskUIMessage, type NumberAudit } from "@/lib/ask-cards";
import { ASK_LIMITS, ASK_MAX_QUESTION_CHARS, ASK_SUGGESTIONS, ASK_TOOL_DONE, ASK_TOOL_LABELS, type AskPlan } from "@/lib/ask-config";
import type { AskLimitReached } from "@/lib/ask-limits";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle, syncServerSession } from "@/lib/sign-in";
import { trackAskAnswerFailed, trackAskAnswerReceived, trackAskQuestionAsked, trackLimitHit } from "@/lib/product-analytics";
import Link from "next/link";

/**
 * The Ask copilot: a conversation where every tool result is drawn as a card
 * with its source, the answer is written underneath, and anything that would
 * change the person's account waits for a button press.
 */

export type ConversationSummary = { id: string; title: string; updated_at: string; messages: number };

export type Allowance = { limit: number; remaining: number };

function newConversationId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

function textOf(message: AskUIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 animate-spin text-oa-primary motion-reduce:animate-none">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.6" />
      <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-oa-muted-fg">
      <path d="M3 7.4 5.8 10.2 11 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Step = { name: string; state: "running" | "done" | "failed" };

/**
 * One fixed line at the top of every answer: what the copilot is doing, then
 * what it did. It never disappears or swaps for another line, so the answer
 * below it does not jump while the lookups run.
 */
function Steps({ steps, streaming, writing }: { steps: Step[]; streaming: boolean; writing: boolean }) {
  const running = steps.filter((step) => step.state === "running");
  const done = steps.filter((step) => step.state !== "running");
  let content: React.ReactNode;
  if (streaming && running.length > 0) {
    content = (
      <>
        <Spinner />
        <span className="truncate">{running.map((step) => ASK_TOOL_LABELS[step.name] ?? "Working").join(" · ")}…</span>
      </>
    );
  } else if (streaming && !writing) {
    content = (
      <>
        <Spinner />
        <span>{steps.length === 0 ? "Thinking…" : "Writing the answer…"}</span>
      </>
    );
  } else if (streaming && done.length === 0) {
    content = (
      <>
        <Spinner />
        <span>Writing the answer…</span>
      </>
    );
  } else if (done.length > 0) {
    const names = Array.from(new Set(done.filter((step) => step.state === "done").map((step) => ASK_TOOL_DONE[step.name] ?? "looked it up")));
    const failed = done.filter((step) => step.state === "failed").length;
    const failedText = failed === 1 ? "a lookup did not finish" : `${failed} lookups did not finish`;
    const line = names.length > 0 ? `${names.join(", ")}${failed > 0 ? `; ${failedText}` : ""}` : failedText;
    content = (
      <>
        <Check />
        <span className="truncate">{line.replace(/^./, (c) => c.toUpperCase())}</span>
      </>
    );
  } else {
    return null;
  }
  return (
    <p className="flex h-5 min-w-0 items-center gap-2 text-[13px] leading-5 text-oa-muted-fg" role="status">
      {content}
    </p>
  );
}

function AuditLine({ audit }: { audit: NumberAudit }) {
  const clean = audit.untraced.length === 0;
  return (
    <p className={`oa-mono flex items-start gap-x-2 text-[11.5px] leading-4 ${clean ? "text-oa-muted-fg" : "text-oa-label"}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="mt-0.5 shrink-0">
        {clean ? (
          <path d="M2.5 6.4 5 8.8 9.6 3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6 2.2v4.6M6 9.3v.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
      {clean ? (
        <span>
          {audit.checked === 1 ? "The 1 figure" : `All ${audit.checked} figures`} in this answer {audit.checked === 1 ? "is" : "are"} in the cards above
        </span>
      ) : (
        <span>
          {audit.traced} of {audit.checked} figures are in the cards above. Not found: {audit.untraced.join(", ")}. Treat {audit.untraced.length === 1 ? "it" : "them"} as unverified.
        </span>
      )}
    </p>
  );
}

function LimitNotice({ limit, onSignIn }: { limit: AskLimitReached; onSignIn: () => void }) {
  const resets = new Date(limit.resets_at);
  const when = Number.isNaN(resets.getTime()) ? "" : resets.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <div className="oa-surface border border-oa-border bg-oa-card p-4" role="status">
      <p className="oa-caption mb-1">{limit.limit === 0 ? "Sign in to ask" : "Daily limit reached"}</p>
      <p className="text-[15px] font-medium text-oa-fg">{limit.message}</p>
      <p className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">
        {limit.next_step === "sign_in"
          ? `A free account gets ${ASK_LIMITS.free.questionsPerDay} questions a day, keeps your conversations and can ask about your own portfolio.`
          : limit.next_step === "upgrade"
            ? `Pro raises it to ${ASK_LIMITS.pro.questionsPerDay} a day.`
            : "That is a lot of questions for one day."}
        {when && limit.limit > 0 ? ` Your questions reset at ${when} your time.` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {limit.next_step === "sign_in" ? (
          <OaButton size="sm" onClick={onSignIn}>
            {limit.limit === 0 ? "Sign in free" : "Sign in to keep going"}
          </OaButton>
        ) : null}
        {limit.next_step === "upgrade" ? (
          <Link prefetch={false} href="/pricing" className={`inline-flex h-8 items-center rounded-lg bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg ${FOCUS}`}>
            See what Pro adds
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The copilot's side of one exchange, in reading order: the steps line, the
 * written answer, then the cards it was written from. Cards wait until the
 * answer is finished, so the text never shoves them down the page mid-read.
 */
function Answer({ message, actions, streaming }: { message: AskUIMessage | null; actions: CardActions; streaming: boolean }) {
  let audit: NumberAudit | null = null;
  let notice: string | null = null;
  const text: string[] = [];
  const steps: Step[] = [];
  const cards: React.ReactNode[] = [];
  message?.parts.forEach((part, index) => {
    if (part.type === "text") {
      if (part.text.trim()) text.push(part.text);
      return;
    }
    if (part.type === "data-audit") {
      audit = part.data;
      return;
    }
    if (part.type === "data-notice") {
      notice = part.data.text;
      return;
    }
    if (part.type.startsWith("tool-")) {
      const tool = part as { type: string; state?: string; output?: unknown };
      const name = tool.type.slice(5);
      if (tool.state === "output-available") {
        steps.push({ name, state: "done" });
        if (isAskCard(tool.output) && tool.output.card !== "matches") {
          cards.push(<AskCardView key={index} card={tool.output} actions={actions} />);
        }
      } else if (tool.state === "output-error") {
        steps.push({ name, state: "failed" });
      } else {
        steps.push({ name, state: "running" });
      }
    }
  });
  const prose = text.join("\n\n");
  if (!streaming && !prose && cards.length === 0 && steps.length === 0) return null;
  return (
    <div className="min-w-0 space-y-3">
      <Steps steps={steps} streaming={streaming} writing={Boolean(prose)} />
      {notice ? <p className="text-[12.5px] leading-5 text-oa-muted-fg">{notice}</p> : null}
      {prose ? <AskMarkdown text={prose} /> : null}
      {!streaming && cards.length > 0 ? <div className="space-y-3 pt-1">{cards}</div> : null}
      {audit && !streaming ? <AuditLine audit={audit} /> : null}
    </div>
  );
}

/** Pair each question with the answer that follows it. */
function exchangesOf(messages: AskUIMessage[]): { question: AskUIMessage; answer: AskUIMessage | null }[] {
  const pairs: { question: AskUIMessage; answer: AskUIMessage | null }[] = [];
  for (const message of messages) {
    if (message.role === "user") pairs.push({ question: message, answer: null });
    else if (message.role === "assistant" && pairs.length > 0) {
      const last = pairs[pairs.length - 1]!;
      // Two assistant messages in a row (a restored conversation can hold that) read as one answer.
      last.answer = last.answer ? { ...last.answer, parts: [...last.answer.parts, ...message.parts] } : message;
    }
  }
  return pairs;
}

function Rail({
  signedIn,
  conversations,
  current,
  onOpen,
  onNew,
  onSignIn,
  allowance,
  plan,
}: {
  signedIn: boolean;
  conversations: ConversationSummary[];
  current: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onSignIn: () => void;
  allowance: Allowance | null;
  plan: AskPlan;
}) {
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        className={`flex h-9 w-full items-center gap-2 rounded-lg border border-oa-border bg-oa-card px-3 text-left text-[14px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        New conversation
      </button>
      <p className="oa-caption mb-1.5 mt-5">Conversations</p>
      {signedIn ? (
        conversations.length > 0 ? (
          <ul className="-mx-1.5 min-h-0 flex-1 space-y-px overflow-y-auto">
            {conversations.map((item) => {
              const active = item.id === current;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left text-[13.5px] leading-5 ${FOCUS} ${
                      active ? "bg-oa-accent font-medium text-oa-fg" : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span suppressHydrationWarning className={`${NUM} shrink-0 text-[11px] text-oa-muted-fg`}>
                      {fmtAgo(item.updated_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] leading-5 text-oa-muted-fg">Your conversations are saved here once you ask something.</p>
        )
      ) : (
        <div>
          <p className="text-[13px] leading-5 text-oa-muted-fg">Sign in to ask. A free account gets {ASK_LIMITS.free.questionsPerDay} questions a day and keeps your conversations.</p>
          <OaButton size="xs" variant="secondary" className="mt-2" onClick={onSignIn}>
            Sign in
          </OaButton>
        </div>
      )}
      {allowance ? (
        <p className={`${NUM} mt-4 border-t border-oa-border pt-3 text-[11.5px] leading-4 text-oa-muted-fg`}>
          {allowance.remaining} of {allowance.limit} questions left today
          <span className="block normal-case">{plan === "anonymous" ? "Signed out" : `${ASK_LIMITS[plan].label} plan`}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ── the workspace ──────────────────────────────────────────────────────── */

export function AskWorkspace({
  signedIn,
  plan,
  initialQuestion,
  initialConversation,
  initialConversations,
  initialAllowance,
}: {
  signedIn: boolean;
  plan: AskPlan;
  initialQuestion: string | null;
  initialConversation: { id: string; items: AskUIMessage[] } | null;
  initialConversations: ConversationSummary[];
  initialAllowance: Allowance | null;
}) {
  const [conversationId, setConversationId] = React.useState(() => initialConversation?.id ?? newConversationId());
  const [conversations, setConversations] = React.useState(initialConversations);
  const [allowance, setAllowance] = React.useState<Allowance | null>(initialAllowance);
  const [limit, setLimit] = React.useState<AskLimitReached | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const limitRef = React.useRef(false);
  /** The newest exchange, scrolled to the top of the view when a question is asked. */
  const lastRef = React.useRef<HTMLElement>(null);
  const scrollPending = React.useRef(false);
  /** When the last question went out. Stop ignores clicks right after it, so a double-click on Ask cannot cancel the answer. */
  const sentAt = React.useRef(0);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const conversationRef = React.useRef(conversationId);
  conversationRef.current = conversationId;

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<AskUIMessage>({
        api: "/api/ask",
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          if (response.status === 429) {
            const data = (await response.clone().json().catch(() => null)) as AskLimitReached | null;
            if (data?.error === "limit_reached") {
              limitRef.current = true;
              trackLimitHit({ feature: "ask", plan: data.plan, limit: data.limit, code: "limit_reached" });
              trackAskAnswerFailed({ reason: "limit", status: 429 });
              setLimit(data);
              setAllowance({ limit: data.limit, remaining: 0 });
            }
          } else if (response.ok) {
            const remaining = Number(response.headers.get("x-ask-remaining"));
            const max = Number(response.headers.get("x-ask-limit"));
            if (Number.isFinite(remaining) && max > 0) setAllowance({ limit: max, remaining });
          }
          return response;
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat<AskUIMessage>({
    messages: initialConversation?.items ?? [],
    transport,
    onError: (error) => {
      if (limitRef.current) return;
      let message = "The copilot could not answer that. Nothing was changed. Try again.";
      let code: string | undefined;
      try {
        const parsed = JSON.parse(error.message) as { message?: string; error?: string };
        if (parsed.message) message = parsed.message;
        if (typeof parsed.error === "string") code = parsed.error;
      } catch {
        // Not a JSON body: keep the plain sentence.
      }
      trackAskAnswerFailed({ reason: "error", message: code ?? error.name });
      setProblem(message);
    },
    onFinish: ({ messages: finished, isError, isAbort }) => {
      if (isAbort) trackAskAnswerFailed({ reason: "aborted" });
      else if (!isError) {
        trackAskAnswerReceived({
          latency_ms: sentAt.current ? Date.now() - sentAt.current : null,
          turn: finished.filter((message) => message.role === "user").length,
        });
      }
      if (!signedIn || isError || isAbort) return;
      const id = conversationRef.current;
      window.history.replaceState(window.history.state, "", `/ask?c=${id}`);
      // Saved from here, after the answer is on screen, so a slow write never delays the reply.
      void fetch("/api/ask/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, messages: finished }) })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { conversations?: ConversationSummary[] } | null) => {
          if (data && Array.isArray(data.conversations)) setConversations(data.conversations);
        })
        .catch(() => undefined);
    },
  });

  const busy = status === "submitted" || status === "streaming";
  /** Questions already in this conversation, read by `ask` for analytics without re-creating it on every streamed token. */
  const userTurns = React.useRef(0);
  userTurns.current = messages.filter((message) => message.role === "user").length;

  // The box grows with what is typed and shrinks back when it is sent, whichever way it was sent.
  React.useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [input]);

  const ask = React.useCallback(
    (question: string, origin: "typed" | "link" | "suggestion" = "suggestion") => {
      const text = question.trim().slice(0, ASK_MAX_QUESTION_CHARS);
      if (!text || busy) return;
      trackAskQuestionAsked({ origin, turn: userTurns.current + 1, question: text });
      // Signed out has no allowance: ask them to sign in here instead of a round trip that can only say no.
      if (plan === "anonymous") {
        setLimit({
          ok: false,
          error: "limit_reached",
          plan,
          limit: 0,
          used: 0,
          remaining: 0,
          resets_at: "",
          next_step: "sign_in",
          message: "Asking takes a free account.",
        });
        setInput(text);
        trackLimitHit({ feature: "ask", plan: "anonymous", limit: 0, code: "sign_in" });
        return;
      }
      limitRef.current = false;
      scrollPending.current = true;
      sentAt.current = Date.now();
      setLimit(null);
      setProblem(null);
      setInput("");
      void sendMessage({ text });
      inputRef.current?.focus();
    },
    [busy, sendMessage, plan],
  );

  const signIn = React.useCallback(async () => {
    try {
      // A browser can still hold a Firebase user after the server session expired: refresh the cookie instead of reloading into the same signed-out page.
      const user = getFirebaseAuth().currentUser;
      if (user) await syncServerSession(user);
      else await signInWithGoogle();
      window.location.reload();
    } catch {
      // The sign-in sheet reports its own errors.
    }
  }, []);

  const actions = React.useMemo<CardActions>(() => ({ signedIn, ask, signIn: () => void signIn() }), [signedIn, ask, signIn]);

  // A question handed over from Explore or a link: ask it once, then clean the address bar.
  const asked = React.useRef(false);
  React.useEffect(() => {
    if (asked.current || !initialQuestion || initialConversation) return;
    asked.current = true;
    // Signed out, keep ?q= in the address so the reload after sign-in asks it.
    if (plan !== "anonymous") window.history.replaceState(window.history.state, "", "/ask");
    ask(initialQuestion, "link");
  }, [initialQuestion, initialConversation, ask, plan]);

  // A new question goes to the top of the view, and its exchange is tall enough to fill the
  // screen, so the answer writes downward into space that is already there. Nothing scrolls
  // or jumps while it streams.
  const questionCount = messages.filter((message) => message.role === "user").length;
  React.useEffect(() => {
    if (!scrollPending.current || questionCount === 0) return;
    scrollPending.current = false;
    lastRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [questionCount, conversationId]);
  React.useEffect(() => {
    if (limit || problem) lastRef.current?.parentElement?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [limit, problem]);

  const startNew = () => {
    if (busy) void stop();
    setMessages([]);
    setConversationId(newConversationId());
    setLimit(null);
    setProblem(null);
    setHistoryOpen(false);
    window.history.replaceState(window.history.state, "", "/ask");
    inputRef.current?.focus();
  };

  const open = async (id: string) => {
    if (id === conversationId && messages.length > 0) return setHistoryOpen(false);
    if (busy) void stop();
    setHistoryOpen(false);
    setProblem(null);
    setLimit(null);
    try {
      const response = await fetch(`/api/ask/conversations/${id}`);
      if (!response.ok) throw new Error("not found");
      const data = (await response.json()) as { conversation: { id: string; items: AskUIMessage[] } };
      scrollPending.current = true;
      setMessages(data.conversation.items);
      setConversationId(data.conversation.id);
      window.history.replaceState(window.history.state, "", `/ask?c=${data.conversation.id}`);
    } catch {
      setProblem("That conversation could not be opened.");
    }
  };

  const empty = messages.length === 0;
  const exchanges = exchangesOf(messages);

  const composer = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        ask(input, "typed");
      }}
      className="flex items-end gap-2 rounded-[22px] border border-oa-border bg-oa-card p-2 pl-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(60,40,20,0.25)] focus-within:border-[color-mix(in_srgb,var(--oa-ring)_70%,transparent)]"
    >
      <label htmlFor="ask-input" className="sr-only">
        Ask a question
      </label>
      <textarea
        id="ask-input"
        ref={inputRef}
        value={input}
        rows={1}
        maxLength={ASK_MAX_QUESTION_CHARS}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            ask(input, "typed");
          }
        }}
        placeholder={empty ? "Ask about a stock or an idea" : "Ask a follow-up"}
        className="max-h-[168px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 text-oa-fg outline-none placeholder:text-oa-muted-fg"
      />
      {busy ? (
        <button
          type="button"
          onClick={() => {
            if (Date.now() - sentAt.current < 600) return;
            void stop();
            inputRef.current?.focus();
          }}
          aria-label="Stop the answer"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-oa-fg text-oa-page transition-opacity hover:opacity-85 ${FOCUS}`}
        >
          <span className="size-2.5 rounded-[2px] bg-current" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Ask"
          className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-oa-primary text-oa-primary-fg transition-opacity hover:opacity-90 disabled:cursor-default ${FOCUS}`}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 11.5v-9M3.2 6.2 7 2.4l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </form>
  );

  const smallPrint = (
    <p className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-1 text-[11.5px] leading-4 text-oa-muted-fg">
      <span>
        {plan === "anonymous" ? `Sign in free to ask ${ASK_LIMITS.free.questionsPerDay} questions a day. ` : ""}Research, not advice.
      </span>
      {allowance ? (
        <span className={`${NUM} lg:hidden`}>
          {allowance.remaining} of {allowance.limit} left today
        </span>
      ) : null}
    </p>
  );

  return (
    <div className="grid gap-x-8 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-7 h-[calc(100dvh-5.5rem)]">
          <Rail signedIn={signedIn} conversations={conversations} current={conversationId} onOpen={(id) => void open(id)} onNew={startNew} onSignIn={() => void signIn()} allowance={allowance} plan={plan} />
        </div>
      </aside>

      <div className="mx-auto flex w-full min-w-0 max-w-[46rem] flex-col">
        {/* Phones and tablets: the rail folds into one row. */}
        <div className={`mb-3 items-center justify-between gap-2 lg:hidden ${empty && !(signedIn && conversations.length > 0) ? "hidden" : "flex"}`}>
          <button type="button" onClick={startNew} className={`inline-flex h-10 items-center gap-1.5 rounded-lg border border-oa-border bg-oa-card px-2.5 text-[13px] font-medium text-oa-fg ${FOCUS}`}>
            <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            New
          </button>
          {signedIn && conversations.length > 0 ? (
            <button type="button" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
              Conversations <span className={NUM}>{conversations.length}</span>
            </button>
          ) : null}
        </div>
        {historyOpen ? (
          <ul className="oa-surface mb-4 max-h-64 divide-y divide-oa-border overflow-y-auto border border-oa-border bg-oa-card lg:hidden">
            {conversations.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => void open(item.id)} className={`flex w-full items-baseline gap-2 px-3 py-2.5 text-left text-[14px] ${FOCUS}`}>
                  <span className="min-w-0 flex-1 truncate text-oa-fg">{item.title}</span>
                  <span className={`${NUM} shrink-0 text-[11.5px] text-oa-muted-fg`}>{fmtAgo(item.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {empty ? (
          <div className="sm:pt-[5vh]">
            {/* The box is the page: the title sits right on top of it and everything else is below. */}
            <h1 className="mb-3 text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg sm:text-[22px] sm:leading-7">Ask about a stock, an idea or your portfolio</h1>
            {composer}
            {smallPrint}
            {limit ? (
              <div className="mt-4">
                <LimitNotice limit={limit} onSignIn={() => void signIn()} />
              </div>
            ) : null}
            {problem ? (
              <p className="mt-4 rounded-xl border border-oa-border bg-oa-bg px-3.5 py-2.5 text-[14px] text-oa-fg" role="alert">
                {problem}
              </p>
            ) : null}
            <p className="oa-caption mb-1 mt-6">Try one</p>
            <ul className="divide-y divide-oa-border border-y border-oa-border">
              {ASK_SUGGESTIONS.map((suggestion) => (
                <li key={suggestion.question}>
                  <button
                    type="button"
                    onClick={() => ask(suggestion.question)}
                    className={`grid min-h-11 w-full items-baseline gap-x-4 py-2 text-left hover:bg-oa-accent sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:px-2 ${FOCUS}`}
                  >
                    <span className="text-[12.5px] leading-5 text-oa-muted-fg">{suggestion.label}</span>
                    <span className="text-pretty text-[15px] leading-[22px] text-oa-fg">{suggestion.question}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-[70ch] text-pretty text-[13px] leading-5 text-oa-muted-fg">
              The copilot looks things up before it answers. Every figure comes from a lookup you can see, with its source and time. It can run a backtest, read a 13F, or turn an idea into a basket.
            </p>
          </div>
        ) : (
          <>
            <h1 className="sr-only">Ask</h1>
            <div className="flex-1 divide-y divide-oa-border">
              {exchanges.map((exchange, index) => {
                const latest = index === exchanges.length - 1;
                return (
                  <section
                    key={exchange.question.id}
                    ref={latest ? lastRef : undefined}
                    className={`scroll-mt-16 py-6 first:pt-1 lg:scroll-mt-6 ${latest ? "min-h-[calc(100dvh-17rem)] lg:min-h-[calc(100dvh-13rem)]" : ""}`}
                  >
                    {/* ph-no-capture keeps the question text out of session replay and autocapture. */}
                    <h2 className="ph-no-capture mb-4 line-clamp-4 whitespace-pre-wrap text-pretty text-[20px] font-medium leading-7 tracking-tight text-oa-fg sm:text-[22px]">
                      {textOf(exchange.question)}
                    </h2>
                    <Answer message={exchange.answer} actions={actions} streaming={busy && latest} />
                    {latest && limit ? (
                      <div className="mt-4">
                        <LimitNotice limit={limit} onSignIn={() => void signIn()} />
                      </div>
                    ) : null}
                    {latest && problem ? (
                      <p className="mt-4 rounded-xl border border-oa-border bg-oa-bg px-3.5 py-2.5 text-[14px] text-oa-fg" role="alert">
                        {problem}
                      </p>
                    ) : null}
                  </section>
                );
              })}
            </div>
            <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 bg-[linear-gradient(to_top,var(--oa-page)_70%,transparent)] px-1 pb-2 pt-4 lg:bottom-0 lg:pb-4">
              {composer}
              {smallPrint}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
