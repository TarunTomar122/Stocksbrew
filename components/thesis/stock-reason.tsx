"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { ReasonsSheet } from "@/components/thesis/reasons-sheet";
import { getCheck, loadChecks, loadTheses, useAllTheses, useCheck, useHeld } from "@/components/thesis/store";
import { useUser } from "@/lib/auth-context";
import { dayWords as sayDay } from "@/lib/day-words";
import { lockCopy } from "@/lib/entitlements";
import { thesisSentence } from "@/lib/thesis";
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

function Sources({ signals, today }: { signals: Signal[]; today: string }) {
  // One mention per source and day: two facts from the same screen are one source.
  const seen = new Set<string>();
  const unique = signals.filter((signal) => {
    const key = `${signal.source}|${signal.asOf}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
      {unique.length === 1 ? "Source: " : "Sources: "}
      {unique.map((signal, index) => (
        <span key={`${signal.source}|${signal.asOf}`}>
          {index > 0 ? "; " : ""}
          {signal.href ? (
            <Link href={signal.href} prefetch={false} className={`rounded underline decoration-oa-border underline-offset-2 hover:text-oa-fg ${FOCUS}`}>
              {signal.source}
            </Link>
          ) : (
            signal.source
          )}
          {signal.asOf ? ` (${dayWords(signal.asOf, today)})` : ""}
        </span>
      ))}
      .
    </p>
  );
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
  // The note already says the first two facts; any more are listed under it, and every fact's source goes at the foot.
  const evidence = check ? (check.signals.length > 0 ? check.signals : check.checked) : [];
  const extra = evidence.slice(2, 4);
  return (
    <div className="mx-auto w-full max-w-[84rem] px-2 pt-3 sm:px-6 sm:pt-4">
      <section aria-label={`Your reason for owning ${ticker}`} className="oa-surface border border-oa-border bg-oa-card px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 max-w-[52rem]">
            {/* No small label over the note (owner, Nov 11): its first sentence already says whether the reason holds. */}
            {check ? (
              <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">
                <ToneGlyph tone={TONE[check.verdict]} className="mr-2 inline-block align-[1px]" />
                {check.note}
              </p>
            ) : (
              <p className="text-pretty text-[15px] leading-[22px] text-oa-fg">{thesisSentence(thesis)}</p>
            )}
            {check?.quote ? <p className="mt-1 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{check.quote}</p> : null}
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
              <li key={signal.id} className="text-pretty text-[14px] leading-5 text-oa-fg">
                {signal.text}
              </li>
            ))}
          </ul>
        ) : null}
        {/* What the check cannot see (check.limit) stays in the data and the docs: the owner wants no mechanics notes on the page. */}
        {evidence.length > 0 || check?.change ? (
          <div className="mt-2.5 flex flex-col gap-1 border-t border-oa-border pt-2.5">
            {evidence.length > 0 ? <Sources signals={evidence} today={today} /> : null}
            {check?.change ? (
              <p className="text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{`${WAS[check.change.from]} until ${sayDay(check.change.day, today) || dayWords(check.change.day, today)}.`}</p>
            ) : null}
          </div>
        ) : null}
      </section>
      {sheet}
    </div>
  );
}
