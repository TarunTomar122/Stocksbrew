"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { ConditionBar } from "@/components/thesis/conditions-picker";
import { ReasonsSheet } from "@/components/thesis/reasons-sheet";
import { getCheck, loadChecks, loadTheses, useAllTheses, useCheck, useHeld } from "@/components/thesis/store";
import { useUser } from "@/lib/auth-context";
import { dayWords as sayDay } from "@/lib/day-words";
import { lockCopy } from "@/lib/entitlements";
import { thesisSentence, type Thesis } from "@/lib/thesis";
import { conditionKey, holdsIfText, type ConditionStatus } from "@/lib/thesis-watch/conditions";
import type { ConditionView } from "@/lib/thesis-watch/server";
import { dayWords, type Signal, type Verdict } from "@/lib/thesis-watch/rules";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const BUTTON = `inline-flex h-9 shrink-0 items-center rounded border border-oa-border bg-oa-card px-3 text-[13.5px] text-oa-fg hover:border-oa-fg/30 ${FOCUS}`;

const TONE: Record<Verdict, "up" | "down" | "flat"> = { holds: "up", weaker: "down", broken: "down", played_out: "flat" };

function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "US_BRK_B" and "BRK.B" are the same stock. */
function bare(value: string): string {
  return value.toUpperCase().replace(/^(US|IN)_/, "").replace(/[._-]/g, "_");
}

/**
 * The dated sources behind the facts, for the note's hover title: "Daily closes (Nov 12); Dividend history (Mar 3)".
 * One mention per source and day. The card shows only the facts (owner rule: no source lines under facts); the
 * proposal's "How I got here" lists them with links.
 */
function sourcesTitle(signals: readonly Signal[], today: string): string | undefined {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const signal of signals) {
    const key = `${signal.source}|${signal.asOf}`;
    if (!signal.source || seen.has(key)) continue;
    seen.add(key);
    parts.push(signal.asOf ? `${signal.source} (${dayWords(signal.asOf, today)})` : signal.source);
  }
  return parts.length > 0 ? `Source${parts.length > 1 ? "s" : ""}: ${parts.join("; ")}` : undefined;
}

const STATUS_TEXT: Record<ConditionStatus, string> = { holds: "text-oa-fg", broken: "text-signal-bearish", unknown: "text-oa-muted-fg" };

/**
 * The reason's measurable lines, each with where the stock is now and a small bar against the line: "Holds if
 * revenue growth > 20%: now 42%". The dated source is the line's hover title (owner rule: no source lines under facts).
 * Before a check comes back (or on a plan that does not check this stock), the lines alone.
 */
function ConditionLines({ thesis, views }: { thesis: Thesis; views: ConditionView[] }) {
  const conditions = thesis.conditions ?? [];
  if (conditions.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {conditions.map((condition) => {
        const view = views.find((item) => item.key === conditionKey(condition)) ?? null;
        const known = view && view.status !== "unknown" && view.now !== null;
        return (
          <li key={conditionKey(condition)} title={view?.source || undefined} className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,10rem)] items-start gap-x-3 gap-y-1 max-sm:grid-cols-1">
            <span className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">
              {holdsIfText(condition)}
              {view ? (
                <span className={`oa-mono tabular-nums ${STATUS_TEXT[view.status]}`}>{known ? `: now ${view.nowText}${view.waitingFor ? `, waiting for ${view.waitingFor}` : ""}` : `: ${lowerFirst(view.line)}`}</span>
              ) : null}
            </span>
            {known ? <ConditionBar metric={condition.metric} now={view.now!} line={condition.value} holds={view.status === "holds"} className="w-full pt-[7px] max-sm:pt-0" /> : <span className="max-sm:hidden" />}
          </li>
        );
      })}
    </ul>
  );
}

function lowerFirst(text: string): string {
  // "Waiting for the figures…" reads on after a colon; an "EPS"-style acronym keeps its capitals.
  return /^[A-Z][a-z]/.test(text) ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text;
}

const WAS: Record<Verdict, string> = {
  holds: "It still held",
  weaker: "It was weaker",
  broken: "It looked broken",
  played_out: "It had played out",
};

/**
 * On the stock page, for the person who owns it: the reason they saved and
 * what the reason watcher found, with each fact's source and date, and the
 * way to change it. When they own it without a reason, one line asks why.
 * Fetched in the browser after the page loads, so the page itself stays
 * cached and the same for everyone.
 */
export function StockReason({ ticker, preview = false }: { ticker: string; /** Local preview page only: show it without a session. */ preview?: boolean }) {
  const { user: signedIn } = useUser();
  const user = preview || signedIn;
  const all = useAllTheses();
  const held = useHeld();
  const [editing, setEditing] = useState(false);
  const key = bare(ticker);
  const id = Object.keys(all ?? {}).find((item) => bare(item) === key) ?? held.find((item) => bare(item) === key) ?? null;
  const { check, locked, pending } = useCheck(id ?? "");

  useEffect(() => {
    if (signedIn && !preview) loadTheses({ checkAll: false });
  }, [signedIn, preview]);
  // Only this stock's check: the page should not wait on, or pay for, the rest of the portfolio.
  const hasReason = Boolean(id && all?.[id]);
  useEffect(() => {
    if (!preview && id && hasReason && !getCheck(id).check && !getCheck(id).pending) loadChecks([id]);
  }, [id, hasReason, preview]);

  if (!user || !all || !id) return null;
  const thesis = all[id] ?? null;
  const stock = { instrument_id: id, ticker, name: null };
  const today = todayET();
  const sheet = editing ? <ReasonsSheet stocks={[stock]} start={stock} onClose={() => setEditing(false)} /> : null;

  if (!thesis) {
    return (
      <div className="mx-auto w-full max-w-[84rem] px-2 pt-3 sm:px-6 sm:pt-4">
        <div className="oa-surface flex flex-col gap-2 border border-oa-border bg-oa-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <p className="text-pretty text-[14px] leading-5 text-oa-fg">Why do you own {ticker}? Save the reason and the agent checks it against the company&apos;s numbers.</p>
          <button type="button" onClick={() => setEditing(true)} className={`${BUTTON} self-start sm:self-auto`}>
            Add your reason
          </button>
        </div>
        {sheet}
      </div>
    );
  }

  const lock = lockCopy("reason_watch");
  // The note already says the first two facts; any more are listed under it. Each fact's dated source is its hover title.
  const evidence = check ? (check.signals.length > 0 ? check.signals : check.checked) : [];
  const extra = evidence.slice(2, 4);
  return (
    <div className="mx-auto w-full max-w-[84rem] px-2 pt-3 sm:px-6 sm:pt-4">
      <section aria-label={`Your reason for owning ${ticker}`} className="oa-surface border border-oa-border bg-oa-card px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 max-w-[52rem]">
            {/* No small label over the note (owner, Nov 11): its first sentence already says whether the reason holds. */}
            {check ? (
              <p title={sourcesTitle(evidence.slice(0, 2), today)} className="text-pretty text-[15px] leading-[22px] text-oa-fg">
                <ToneGlyph tone={TONE[check.verdict]} className="mr-2 inline-block align-[1px]" />
                {check.note}
              </p>
            ) : (
              <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{thesisSentence(thesis)}</p>
            )}
            {/* The person's own words fold behind one quiet toggle (owner, Nov 13: "too much text"): the check above is the news. */}
            {check?.quote ? <OwnWords quote={check.quote} /> : null}
            <ConditionLines thesis={thesis} views={check?.conditions ?? []} />
            {pending && !check ? <p className="mt-1 text-[13px] text-oa-muted-fg">Checking it against today&apos;s numbers.</p> : null}
            {locked ? (
              <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
                {lock.body}{" "}
                <Link href="/pricing" prefetch={false} className={`rounded font-medium text-oa-primary hover:underline ${FOCUS}`}>
                  See Pro
                </Link>
              </p>
            ) : null}
          </div>
          <button type="button" onClick={() => setEditing(true)} className={`${BUTTON} self-start`}>
            Change your reason
          </button>
        </div>
        {extra.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {extra.map((signal) => (
              <li key={signal.id} title={sourcesTitle([signal], today)} className="text-pretty text-[14px] leading-5 text-oa-fg">
                {signal.text}
              </li>
            ))}
          </ul>
        ) : null}
        {/* What the check cannot see (check.limit) stays in the data and the docs: the owner wants no mechanics notes on the page. */}
        {check?.change ? (
          <p className="mt-1.5 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{`${WAS[check.change.from]} until ${sayDay(check.change.day, today) || dayWords(check.change.day, today)}.`}</p>
        ) : null}
      </section>
      {sheet}
    </div>
  );
}

/** "Your words": the reason as the person wrote it, folded until asked for. */
function OwnWords({ quote }: { quote: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 rounded text-[13px] leading-5 text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}
      >
        Your words
        <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? <p className="mt-0.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{quote}</p> : null}
    </div>
  );
}
