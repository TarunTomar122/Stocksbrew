"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import type { CardActions } from "@/components/ask/cards";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { AgentMark, FOCUS, NOTE_CARD } from "@/components/thread/thread-note";
import { planMayRun } from "@/lib/agent-jobs";
import type { PlainSpec } from "@/lib/agents-plain/parse";
import type { AskUIMessage } from "@/lib/ask-cards";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import type { Plan } from "@/lib/entitlements";
import { currentFirebaseUser, firebaseUserNow, signInWithGoogle, syncServerSession } from "@/lib/sign-in";
import { replyRoute, savedNote } from "@/lib/thread/reply";

/**
 * The thread's reply box: the bottom of the conversation. A question goes to Ask (the same copilot, tools and
 * allowance as /ask) with the person's stocks as its context, and the answer is drawn here as the agent's next note.
 * A plain instruction ("watch AMD for a 5% drop") is read by the agents' own reader and shown back as what the agent
 * would watch; nothing is saved until the person presses the button, and then through the agents' save path. What
 * cannot be read as an agent is said plainly, with Ask offered instead.
 */

// The answer's cards load with the first answer, not with the page.
const AskAnswer = dynamic(() => import("@/components/ask/ask-workspace").then((module) => module.Answer), {
  ssr: false,
  loading: () => <p className="text-[14px] text-oa-muted-fg">Looking into it…</p>,
});

type ParseResponse = {
  spec: PlainSpec;
  existing: boolean[];
  signedIn: boolean;
  plan: Plan;
  capacity: { running: number; total: number; limit: number; max: number } | null;
};

type SaveResponse = {
  ok: true;
  jobs: Array<{ name: string; enabled: boolean; trigger: Parameters<typeof planMayRun>[0]["trigger"] }>;
  already: string[];
  failed: string[];
  paused: { count: number; limit: number } | null;
};

type Entry =
  | { id: string; kind: "you"; text: string }
  | { id: string; kind: "answer"; turn: number }
  | { id: string; kind: "say"; text: string; offerAsk?: string | null; startFree?: boolean }
  | { id: string; kind: "watch"; result: ParseResponse; state: "ready" | "saving" | "saved"; said?: string; error?: string | null };

let counter = 0;
const entryId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

function newConversationId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

function AgentSays({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <AgentMark className="mt-1.5 hidden sm:flex" />
      <div className={`${NOTE_CARD} min-w-0 flex-1 px-4 py-3`}>{children}</div>
    </div>
  );
}

function YouSaid({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-oa-accent px-3.5 py-2 text-pretty text-[15px] leading-[22px] text-oa-fg">{text}</p>
    </div>
  );
}

const BUTTON = `inline-flex min-h-8 items-center rounded-full px-3 text-[13px] font-medium transition-colors disabled:opacity-60 ${FOCUS}`;
const PRIMARY = `${BUTTON} bg-oa-primary text-oa-primary-fg hover:opacity-90`;
const QUIET = `${BUTTON} border border-oa-border bg-oa-bg text-oa-fg hover:bg-oa-accent`;

/** answer turn n: the assistant message after the n-th question. */
function answerFor(messages: AskUIMessage[], turn: number): AskUIMessage | null {
  let seen = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role !== "user") continue;
    seen += 1;
    if (seen === turn) {
      const next = messages[i + 1];
      return next && next.role === "assistant" ? next : null;
    }
  }
  return null;
}

export function ThreadComposer({ signedIn, example, suggestions }: { signedIn: boolean; example: boolean; suggestions: string[] }) {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [input, setInput] = React.useState("");
  const [reading, setReading] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const turns = React.useRef(0);
  const conversation = React.useRef<string | null>(null);
  const limitHit = React.useRef(false);

  const push = React.useCallback((...next: Entry[]) => setEntries((current) => [...current, ...next]), []);
  const say = React.useCallback(
    (text: string, extra: { offerAsk?: string | null; startFree?: boolean } = {}) => {
      push({ id: entryId(), kind: "say", text, ...extra });
      setAnnounce(text);
    },
    [push],
  );

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<AskUIMessage>({
        api: "/api/ask",
        fetch: async (url, init) => {
          const response = await fetch(url, init);
          if (response.status === 429) {
            const data = (await response.clone().json().catch(() => null)) as { message?: string } | null;
            limitHit.current = true;
            say(data?.message || "That's all the questions for today. Your allowance starts again tomorrow.");
          }
          return response;
        },
      }),
    [say],
  );

  const { messages, sendMessage, status } = useChat<AskUIMessage>({
    transport,
    onError: (error) => {
      if (limitHit.current) return;
      let message = "I couldn't answer that just now. Nothing was changed. Try again.";
      try {
        const parsed = JSON.parse(error.message) as { message?: string };
        if (parsed.message) message = parsed.message;
      } catch {
        // Not a JSON body: keep the plain sentence.
      }
      say(message);
    },
    onFinish: ({ messages: finished, isError, isAbort }) => {
      if (!signedIn || isError || isAbort) return;
      // Kept in Ask's history too, after the answer is on screen, so a slow write never delays it.
      conversation.current ??= newConversationId();
      void fetch("/api/ask/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: conversation.current, messages: finished }),
      }).catch(() => undefined);
    },
  });
  const answering = status === "submitted" || status === "streaming";
  /** One short announcement per reply for screen readers, never the streamed answer chunk by chunk. */
  const [announce, setAnnounce] = React.useState("");
  const wasAnswering = React.useRef(false);
  React.useEffect(() => {
    if (wasAnswering.current && !answering) setAnnounce("Your agent answered.");
    wasAnswering.current = answering;
  }, [answering]);
  const busy = answering || reading;

  React.useEffect(() => {
    if (entries.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);

  const askIt = React.useCallback(
    (text: string) => {
      if (!signedIn) {
        say(
          example
            ? "Asking takes a free account. Start free, add your stocks, and ask me about them."
            : "Asking takes a free account. Sign in and ask me again.",
          { startFree: true },
        );
        return;
      }
      limitHit.current = false;
      const turn = turns.current++;
      push({ id: entryId(), kind: "answer", turn });
      void sendMessage({ text }, { body: { context: "portfolio" } });
    },
    [signedIn, example, say, push, sendMessage],
  );

  const readInstruction = React.useCallback(
    async (text: string) => {
      setReading(true);
      try {
        const response = await fetch("/api/agents/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const body = (await response.json().catch(() => null)) as (ParseResponse & { error?: string }) | null;
        if (!response.ok || !body?.spec) {
          say(body?.error || "I couldn't read that just now. Try again in a moment.", { offerAsk: signedIn ? text : null });
          return;
        }
        if (body.spec.watches.length === 0) {
          const why = body.spec.cannot.map((entry) => entry.line).join(" ");
          say(`I can't set that up as an agent.${why ? ` ${why}` : ""}${signedIn ? " I can answer it as a question instead." : ""}`, { offerAsk: signedIn ? text : null });
          return;
        }
        push({ id: entryId(), kind: "watch", result: body, state: "ready" });
        setAnnounce(body.spec.lead);
      } catch {
        say("I couldn't read that just now. Try again in a moment.");
      } finally {
        setReading(false);
      }
    },
    [say, push, signedIn],
  );

  const send = React.useCallback(
    (raw: string, typed = false) => {
      const text = raw.replace(/\s+/g, " ").trim().slice(0, ASK_MAX_QUESTION_CHARS);
      if (!text || busy) return;
      setInput("");
      push({ id: entryId(), kind: "you", text });
      if (replyRoute(text) === "instruction") void readInstruction(text);
      else askIt(text);
      // A tapped suggestion keeps the phone's keyboard down, so the reply stays in view.
      if (typed) inputRef.current?.focus();
    },
    [busy, push, readInstruction, askIt],
  );

  const save = React.useCallback(
    async (id: string, result: ParseResponse) => {
      setEntries((current) => current.map((entry) => (entry.id === id && entry.kind === "watch" ? { ...entry, state: "saving", error: null } : entry)));
      try {
        const response = await fetch("/api/agents/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ drafts: result.spec.watches.map((watch) => watch.draft) }),
        });
        const body = (await response.json().catch(() => null)) as (SaveResponse & { error?: string }) | null;
        if (!response.ok || !body?.ok) throw new Error(body?.error || "That didn't save. Try again in a moment.");
        const said = savedNote({
          saved: body.jobs,
          already: body.already,
          failed: body.failed,
          limit: body.paused?.limit ?? result.capacity?.limit ?? null,
          proOnly: body.jobs.filter((job) => !job.enabled && !planMayRun(job, result.plan)).map((job) => job.name),
        });
        setEntries((current) => current.map((entry) => (entry.id === id && entry.kind === "watch" ? { ...entry, state: "saved", said } : entry)));
        setAnnounce(said);
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : "That didn't save. Try again in a moment.";
        setEntries((current) => current.map((entry) => (entry.id === id && entry.kind === "watch" ? { ...entry, state: "ready", error } : entry)));
      }
    },
    [],
  );

  const signIn = React.useCallback(async () => {
    try {
      const known = firebaseUserNow();
      const user = known !== undefined ? known : await currentFirebaseUser();
      if (user) await syncServerSession(user);
      else await signInWithGoogle();
      window.location.reload();
    } catch {
      // The sign-in sheet reports its own errors.
    }
  }, []);
  const actions = React.useMemo<CardActions>(() => ({ signedIn, ask: (question) => send(question), signIn: () => void signIn() }), [signedIn, send, signIn]);

  // The box grows with what is typed and shrinks back when it is sent.
  React.useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`;
  }, [input]);

  return (
    <>
      {entries.length > 0 ? (
        <div className="flex flex-col gap-3 pt-1">
          {entries.map((entry) => {
            if (entry.kind === "you") return <YouSaid key={entry.id} text={entry.text} />;
            if (entry.kind === "answer") {
              const message = answerFor(messages, entry.turn);
              const streaming = answering && entry.turn === turns.current - 1;
              if (!message && !streaming) return null;
              return (
                <AgentSays key={entry.id}>
                  <AskAnswer message={message} actions={actions} streaming={streaming} />
                </AgentSays>
              );
            }
            if (entry.kind === "say") {
              return (
                <AgentSays key={entry.id}>
                  <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{entry.text}</p>
                  {entry.offerAsk || entry.startFree ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {entry.offerAsk ? (
                        <button type="button" className={QUIET} disabled={busy} onClick={() => askIt(entry.offerAsk!)}>
                          Ask it as a question
                        </button>
                      ) : null}
                      {entry.startFree ? <StartFreeButton surface="home_content" size="sm" next="/agent" /> : null}
                    </div>
                  ) : null}
                </AgentSays>
              );
            }
            const { spec, existing } = entry.result;
            const all = existing.length > 0 && existing.every(Boolean);
            return (
              <AgentSays key={entry.id}>
                {entry.state === "saved" ? (
                  <>
                    <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{entry.said}</p>
                    <div className="mt-2.5">
                      <Link href="/agents" prefetch={false} className={QUIET}>
                        See all your agents
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-pretty text-[15px] font-medium leading-[22px] text-oa-fg">{spec.lead}</p>
                    {spec.watches.length > 1 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] leading-5 text-oa-fg">
                        {spec.watches.map((watch, index) => (
                          <li key={index}>{watch.line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {spec.watches.map((watch) => watch.note).filter(Boolean).slice(0, 2).map((note, index) => (
                      <p key={index} className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
                        {note}
                      </p>
                    ))}
                    {spec.cannot.length > 0 ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{spec.cannot.map((item) => item.line).join(" ")}</p> : null}
                    {entry.error ? (
                      <p role="alert" className="mt-1.5 text-[13.5px] leading-5 text-[var(--signal-bearish)]">
                        {entry.error}
                      </p>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {all ? (
                        <p className="text-[13.5px] text-oa-muted-fg">You already have {spec.watches.length === 1 ? "this agent" : "these agents"}.</p>
                      ) : signedIn ? (
                        <button type="button" className={PRIMARY} disabled={entry.state === "saving"} onClick={() => void save(entry.id, entry.result)}>
                          {entry.state === "saving" ? "Setting it up…" : spec.watches.length === 1 ? "Start watching" : `Start all ${spec.watches.length}`}
                        </button>
                      ) : (
                        <StartFreeButton surface="home_content" size="sm" label="Start free to switch it on" next="/agent" />
                      )}
                    </div>
                  </>
                )}
              </AgentSays>
            );
          })}
          {reading ? (
            <AgentSays>
              <p className="text-[14px] text-oa-muted-fg">Reading that…</p>
            </AgentSays>
          ) : null}
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {/* Scrolled to after each new note, clear of the sticky reply box (and the phone's tab bar under it). */}
      <div ref={endRef} className="scroll-mb-[calc(9.5rem+env(safe-area-inset-bottom))] lg:scroll-mb-28" />

      {/* In the flow, not in the sticky box: on a phone they would take a quarter of the screen. */}
      {entries.length === 0 && suggestions.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-2">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" data-suggestion="" onClick={() => send(suggestion)} className={`${QUIET} bg-oa-card`}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 -mt-2 bg-[linear-gradient(to_top,var(--oa-page)_70%,transparent)] px-1 pb-2 pt-4 lg:bottom-0 lg:pb-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input, true);
          }}
          className="flex items-end gap-2 rounded-[22px] border border-oa-border bg-oa-card p-2 pl-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(60,40,20,0.25)] focus-within:border-[color-mix(in_srgb,var(--oa-fg)_30%,transparent)]"
        >
          <label htmlFor="thread-input" className="sr-only">
            Reply to your agent
          </label>
          <textarea
            id="thread-input"
            ref={inputRef}
            value={input}
            rows={1}
            maxLength={ASK_MAX_QUESTION_CHARS}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(input, true);
              }
            }}
            placeholder="Ask, or tell me what to watch"
            className="max-h-[168px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 text-oa-fg outline-none placeholder:text-oa-muted-fg focus:outline-none focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-oa-primary text-oa-primary-fg transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60 ${FOCUS}`}
          >
            <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 11.5v-9M3.2 6.2 7 2.4l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
    </>
  );
}
