"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { SignInButton } from "@/components/briefing/sign-in-button";
import { OaButton } from "@/components/oa/button";
import { AGENT_TEMPLATES, planMayRun, type AgentFacts, type AgentJob, type AgentJobDraft } from "@/lib/agent-jobs";
import type { PlainCannot, PlainParseResult } from "@/lib/agents-plain/parse";
import { savedSentence } from "@/lib/agents-plain/save";

/**
 * "Tell your agent what to watch": one box on top of the Agents page. A
 * person types a request in their own words, we read it back as the agents
 * we would set up (or say plainly what we can't watch), and they save it.
 * Signed out, the read-back works and saving asks for a sign-in; the request
 * is kept across the sign-in reload.
 */

const EXAMPLES = [
  "Tell me if NVDA drops below 150 or a fund sells it",
  "Ping me when anything I own moves more than 5% in a day",
  "Let me know 3 days before Apple reports earnings",
  "Tell me when a member of Congress trades Microsoft",
];

/**
 * Tells the page around the box what the person's words were read as, so the builder below can swap its
 * example for a preview of this agent instead of showing an unrelated one next to it. Null when the read-back
 * is cleared (saved, or nothing understood).
 */
export const PlainAgentReadContext = React.createContext<((drafts: AgentJobDraft[] | null) => void) | null>(null);

/** Longest request a link can prefill (`/agents?q=`); the field itself takes 300 characters. */
const PREFILL_MAX = 300;

const PENDING_KEY = "stocksbrew.plain-agent.pending";
/** A request stashed for a sign-in that never finished is not picked up much later. */
const PENDING_TTL_MS = 10 * 60 * 1000;

type ParseResponse = {
  spec: PlainParseResult;
  /** Why the model didn't read this one: the person's own daily reads, or the service being busy. */
  limited: "model" | "busy" | null;
  /** Per watch: the person already has this agent. */
  existing: boolean[];
  signedIn: boolean;
  plan: "anon" | "free" | "pro";
  tracked: number | null;
  capacity: { running: number; total: number; limit: number; max: number } | null;
};

type SaveResponse = { ok: true; jobs: AgentJob[]; already: string[]; failed?: string[]; paused: { count: number; limit: number; pro_only?: number } | null };

const CARD = "oa-surface overflow-hidden border border-oa-border bg-oa-card";
const FIELD =
  "block w-full resize-none rounded-lg border border-oa-border bg-oa-bg px-3 py-2.5 text-[16px] leading-6 text-oa-fg outline-none placeholder:text-oa-muted-fg sm:text-[15px] " +
  "focus-visible:border-[color:color-mix(in_srgb,var(--oa-fg)_40%,transparent)] focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_40%,transparent)]";
const CHIP =
  "inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-oa-border bg-oa-card px-3 py-1.5 text-left text-[13.5px] leading-5 text-oa-muted-fg transition-colors " +
  "hover:bg-oa-accent hover:text-oa-fg outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] disabled:opacity-50";

function stash(text: string) {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ text, at: Date.now() }));
  } catch {
    // Private windows can refuse storage; the person retypes after signing in.
  }
}

function takeStash(): string | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    const value = raw ? (JSON.parse(raw) as { text?: unknown; at?: unknown }) : null;
    if (!value || typeof value.text !== "string" || typeof value.at !== "number") return null;
    return Date.now() - value.at < PENDING_TTL_MS ? value.text : null;
  } catch {
    return null;
  }
}

function capacityNote(result: ParseResponse, count: number): string | null {
  const capacity = result.capacity;
  if (!capacity || count === 0) return null;
  const room = capacity.max - capacity.total;
  if (count > room) {
    return room <= 0
      ? `You have ${capacity.max} agents, the most one account can keep. Remove one to save this.`
      : `You have room for ${room} more ${room === 1 ? "agent" : "agents"}, and this sets up ${count}. Remove one first, or ask for fewer things at once.`;
  }
  // Filing and news watches the plan does not include are saved paused whatever the count (lib/entitlements.ts agent_events).
  const proOnly = result.spec.watches.filter((watch) => !planMayRun(watch.draft, result.plan)).length;
  if (proOnly > 0) {
    return `Watching filings and news is part of Pro, so ${proOnly === count ? (count === 1 ? "this one" : "these") : `${proOnly} of these`} will be saved paused. Change ${proOnly === 1 ? "it" : "them"} to watch a price, an earnings date or a big move to run on Free.`;
  }
  const paused = Math.max(0, capacity.running + count - capacity.limit);
  if (paused === 0) return null;
  const runs = capacity.limit === 1 ? "one agent" : capacity.limit === 2 ? "two agents" : `${capacity.limit} agents`;
  const plan = result.plan === "free" ? `Free runs ${runs} at a time` : `Your plan runs ${runs} at a time`;
  const on = capacity.running === 1 ? "you have 1 on" : `you have ${capacity.running} on`;
  return `${plan} and ${on}, so ${paused === count ? (count === 1 ? "this one" : "these") : `${paused} of these`} will be saved paused. Pause another agent to switch ${paused === 1 ? "it" : "them"} on.`;
}

/** The existing "no data yet" warning, for an agent whose source has not been collected. */
function sourceNote(template: string, available: AgentFacts["available"] | undefined): string | null {
  const needs = AGENT_TEMPLATES.find((entry) => entry.id === template)?.needs;
  if (!available || !needs || available[needs]) return null;
  if (needs === "fund_filings") return "13F filings are not in yet. Until they are, this agent says it couldn't check.";
  if (needs === "insiders") return "Insider trades are not in yet. Until they are, this agent says it couldn't check.";
  return "This source is not available right now. Until it is, this agent says it couldn't check.";
}

function WatchNotes({ note, have, source }: { note: string | null; have: boolean; source: string | null }) {
  if (!note && !have && !source) return null;
  return (
    <>
      {have ? <p className="mt-1 text-pretty text-[13.5px] font-medium leading-5 text-oa-fg">You already have this agent, so saving leaves it as it is.</p> : null}
      {source ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-fg">{source}</p> : null}
      {note ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{note}</p> : null}
    </>
  );
}

function CannotRow({ entry, onTry, busy }: { entry: PlainCannot; onTry: (text: string) => void; busy: boolean }) {
  const quoted = entry.what && entry.code !== "unclear" && entry.code !== "not_a_us_stock";
  return (
    <li className="flex gap-2.5">
      <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--oa-fg)_45%,transparent)]" />
      <div className="min-w-0">
        {quoted ? <p className="text-[12.5px] leading-5 text-oa-muted-fg">You asked: “{entry.what}”</p> : null}
        <p className="text-pretty text-[14px] leading-[21px] text-oa-fg">{entry.line}</p>
        {entry.suggest ? (
          <button type="button" disabled={busy} onClick={() => onTry(entry.suggest!)} className={`${CHIP} mt-1.5`}>
            Try “{entry.suggest}”
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function PlainAgentBox({
  signedIn,
  available,
  prefill,
}: {
  signedIn: boolean;
  available?: AgentFacts["available"];
  /** A request from a "Watch this for me" link elsewhere (`/agents?q=`): filled in and read back on arrival. */
  prefill?: string | null;
}) {
  const router = useRouter();
  const onRead = React.useContext(PlainAgentReadContext);
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<ParseResponse | null>(null);
  const [readFor, setReadFor] = React.useState("");
  const [busy, setBusy] = React.useState<"read" | "save" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const fieldRef = React.useRef<HTMLTextAreaElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const read = React.useCallback(async (value: string) => {
    const request = value.replace(/\s+/g, " ").trim();
    if (!request) {
      setError("Type what you want watched first, like “tell me if NVDA closes below 150”.");
      return;
    }
    setBusy("read");
    setError(null);
    setSaved(null);
    try {
      const response = await fetch("/api/agents/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: request }),
      });
      const body = (await response.json().catch(() => null)) as (ParseResponse & { error?: string }) | null;
      if (!response.ok || !body?.spec) throw new Error(body?.error || "I couldn't read that just now. Try again in a moment.");
      setResult(body);
      setReadFor(request);
      onRead?.(body.spec.watches.length > 0 ? body.spec.watches.map((watch) => watch.draft) : null);
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "I couldn't read that just now. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }, [onRead]);

  // Back from signing in: pick up the request that was waiting to be saved. Otherwise a request from a
  // "Watch this for me" link is filled in and read back, so the person sees the agent before saving anything.
  const prefillUsed = React.useRef<string | null>(null);
  React.useEffect(() => {
    const pending = signedIn ? takeStash() : null;
    // The link's request is read once: signing in later must not overwrite what the person typed since.
    const fresh = prefill && prefillUsed.current !== prefill ? prefill.replace(/\s+/g, " ").trim().slice(0, PREFILL_MAX) : "";
    if (prefill) prefillUsed.current = prefill;
    const asked = pending ?? fresh;
    if (asked) {
      setText(asked);
      void read(asked);
    }
    // Once per arrival: a later change of the read callback must not read the request again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, prefill]);

  function tryText(value: string) {
    setText(value);
    void read(value);
  }

  async function save() {
    if (!result) return;
    setBusy("save");
    setError(null);
    try {
      const response = await fetch("/api/agents/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drafts: result.spec.watches.map((watch) => watch.draft) }),
      });
      const body = (await response.json().catch(() => null)) as (SaveResponse & { error?: string }) | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error || "That didn't save. Try again in a moment.");
      setSaved(
        savedSentence({
          saved: body.jobs,
          already: body.already,
          failed: body.failed,
          limit: body.paused?.limit ?? result.capacity?.limit ?? null,
          proOnly: body.jobs.filter((job) => !job.enabled && !planMayRun(job, result.plan)).map((job) => job.name),
        }),
      );
      setResult(null);
      setText("");
      onRead?.(null);
      // The list of agents below is drawn on the server; fetch it again so the new ones show.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  function change() {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.select();
    field.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const spec = result?.spec ?? null;
  const stale = Boolean(spec) && text.replace(/\s+/g, " ").trim() !== readFor;
  const count = spec?.watches.length ?? 0;
  const have = (index: number) => Boolean(result?.existing?.[index]);
  // Agents the person already has are skipped on save, so they don't count toward the limits.
  const fresh = spec ? spec.watches.filter((_, index) => !have(index)).length : 0;
  const roomNote = result ? capacityNote(result, fresh) : null;
  const full = Boolean(result?.capacity && fresh > result.capacity.max - result.capacity.total);
  const emptyList = Boolean(spec?.uses_watchlist && result?.signedIn && result.tracked === 0);

  return (
    <section aria-labelledby="plain-agent-title" className={CARD}>
      <form
        className="px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4 sm:pt-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void read(text);
        }}
      >
        <h2 id="plain-agent-title" className="text-balance text-[17px] font-semibold leading-6 text-oa-fg">
          Tell your agent what to watch
        </h2>
        <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-muted-fg">
          Write it the way you would say it. I&apos;ll read it back before anything is saved.
        </p>
        <label htmlFor="plain-agent-input" className="sr-only">
          What should your agent watch?
        </label>
        <textarea
          id="plain-agent-input"
          ref={fieldRef}
          rows={2}
          maxLength={300}
          value={text}
          enterKeyHint="go"
          placeholder="For example: tell me if NVDA drops below 150 or a fund sells it"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void read(text);
            }
          }}
          className={`${FIELD} mt-2.5`}
        />
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          {/* On a phone the button sits right under the field, and the examples step aside once there is a preview. */}
          <OaButton type="submit" loading={busy === "read"} className="shrink-0 max-sm:!h-10 max-sm:w-full sm:order-2">
            Build my agent
          </OaButton>
          <div className={`min-w-0 sm:order-1 ${spec || saved ? "max-sm:hidden" : ""}`}>
            <p id="plain-agent-examples" className="mb-1.5 text-[12.5px] leading-5 text-oa-muted-fg sm:sr-only">
              Or start from one of these
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="plain-agent-examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" disabled={busy !== null} onClick={() => tryText(example)} className={CHIP}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>

      {error ? (
        <p role="alert" className="border-t border-oa-border px-3.5 py-2.5 text-[14px] leading-5 text-signal-bearish sm:px-4">
          {error}
        </p>
      ) : null}

      {saved ? (
        <div role="status" className="border-t border-oa-border bg-oa-bg px-3.5 py-3 sm:px-4">
          <p className="text-pretty text-[14.5px] leading-[22px] text-oa-fg">{saved}</p>
        </div>
      ) : null}

      {/* Mounted from the start, so a screen reader announces the first preview too. */}
      <div ref={previewRef} aria-live="polite">
      {spec ? (
        <div className="border-t border-oa-border bg-oa-bg px-3.5 py-3.5 sm:px-4">
          {count > 0 ? (
            <>
              <p className="oa-label">What I understood</p>
              {count === 1 ? (
                <div className="mt-1.5">
                  <p className="text-pretty text-[16px] font-medium leading-6 text-oa-fg">{spec.lead}</p>
                  <WatchNotes note={spec.watches[0].note} have={have(0)} source={sourceNote(spec.watches[0].draft.template, available)} />
                </div>
              ) : (
                <div className="mt-1.5">
                  <p className="text-pretty text-[16px] font-medium leading-6 text-oa-fg">{spec.lead}</p>
                  <ul className="mt-2 grid gap-2.5">
                    {spec.watches.map((watch, index) => (
                      <li key={index} className="flex gap-2.5">
                        <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-oa-primary" />
                        <div className="min-w-0">
                          <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">
                            {watch.line.charAt(0).toUpperCase() + watch.line.slice(1)}
                            {index < count - 1 ? ", or" : "."}
                          </p>
                          <WatchNotes note={watch.note} have={have(index)} source={sourceNote(watch.draft.template, available)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}

          {spec.cannot.length > 0 ? (
            <div className={count > 0 ? "mt-3.5 border-t border-oa-border pt-3" : ""}>
              {count > 0 ? <p className="oa-label mb-1.5">What I left out</p> : null}
              <ul className="grid gap-2.5">
                {spec.cannot.map((entry, index) => (
                  <CannotRow key={index} entry={entry} onTry={tryText} busy={busy !== null} />
                ))}
              </ul>
            </div>
          ) : null}

          {result?.limited ? (
            <p className="mt-3 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
              {result.limited === "model"
                ? "You have used today's longer reads, so I read this with simpler rules. Check it closely before you save."
                : "I couldn't do a longer read just now, so I read this with simpler rules. Check it closely before you save."}
            </p>
          ) : null}
          {emptyList ? (
            <p className="mt-3 text-pretty text-[13.5px] leading-5 text-oa-fg">
              You don&apos;t track any stocks yet, so this has nothing to watch until you add some in{" "}
              <Link href="/portfolio?tab=holdings" className="font-medium underline underline-offset-2">
                My stocks
              </Link>
              .
            </p>
          ) : null}
          {roomNote ? <p className="mt-3 text-pretty text-[13.5px] leading-5 text-oa-fg">{roomNote}</p> : null}
          {stale ? (
            <p className="mt-3 text-pretty text-[13.5px] leading-5 text-oa-fg">You changed the words. Build it again to see the new version before you save.</p>
          ) : null}

          <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {count > 0 ? (
              signedIn ? (
                <OaButton onClick={save} loading={busy === "save"} disabled={stale || full || fresh === 0 || busy !== null} className="max-sm:!h-10 max-sm:w-full">
                  {fresh === 0 ? "You have these already" : fresh === 1 ? (count === 1 ? "Save this agent" : "Save the new agent") : `Save these ${fresh} agents`}
                </OaButton>
              ) : (
                <span className="contents" onClickCapture={() => stash(readFor)}>
                  <SignInButton label={count === 1 ? "Sign in to save it" : "Sign in to save them"} size="md" className="max-sm:!h-10 max-sm:w-full" />
                </span>
              )
            ) : null}
            <OaButton variant="secondary" onClick={change} className="max-sm:!h-10 max-sm:w-full">
              {count > 0 ? "Change it" : "Try other words"}
            </OaButton>
            {!signedIn && count > 0 ? (
              <p className="text-pretty text-[13px] leading-5 text-oa-muted-fg sm:ml-1">Signing in is free, and your request stays here while you do.</p>
            ) : null}
          </div>
        </div>
      ) : null}
      </div>
    </section>
  );
}
