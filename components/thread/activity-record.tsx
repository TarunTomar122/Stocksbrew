"use client";

import Link from "next/link";
import * as React from "react";

import { StockLogo } from "@/components/stock-logo";
import { PROPOSAL_ANSWERED_EVENT, type ProposalAnsweredDetail } from "@/lib/proposals-event";
import { RECORD_LINES, type RecordDay, type RecordItem } from "@/lib/thread/record";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
const TONE = { up: "text-signal-bullish", down: "text-signal-bearish", flat: "text-oa-fg" } as const;
const TAG_TONE: Record<string, string> = {
  Done: "text-signal-bullish bg-[color-mix(in_srgb,var(--signal-bullish)_10%,transparent)]",
  Dismissed: "text-oa-muted-fg bg-oa-accent",
  Expired: "text-oa-muted-fg bg-oa-accent",
};

/** The agent's own lines (the day's move) carry its mark; a stock's line its logo. */
function Lead({ item }: { item: RecordItem }) {
  if (item.ticker) return <StockLogo ticker={item.ticker} size={22} />;
  return (
    <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-oa-fg text-oa-page">
      <svg width="11" height="11" viewBox="0 0 56 56" fill="none">
        <path d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
        <path d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Row({ item }: { item: RecordItem }) {
  const quiet = item.kind === "quiet";
  const body = (
    <>
      <Lead item={item} />
      <span className={`min-w-0 flex-1 text-pretty text-[14px] leading-5 ${quiet ? "text-oa-muted-fg" : "text-oa-fg"}`}>
        {item.ticker && !item.text.includes(item.ticker) ? <span className="oa-mono mr-1.5 font-semibold">{item.ticker}</span> : null}
        {item.text}
      </span>
      {item.tag ? (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${TAG_TONE[item.tag] ?? "text-oa-muted-fg bg-oa-accent"}`}>{item.tag}</span>
      ) : item.figure ? (
        <span className={`oa-mono shrink-0 text-[14px] font-semibold tabular-nums ${TONE[item.figure.tone]}`}>{item.figure.value}</span>
      ) : null}
    </>
  );
  const row = "flex min-w-0 items-start gap-2.5 px-3.5 py-2.5";
  return (
    <li>
      {item.href ? (
        <Link href={item.href} prefetch={false} className={`${row} transition-colors hover:bg-oa-accent ${FOCUS}`}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  );
}

/** The stored days with the lines answered on this page put first under today (a line already stored is not doubled). */
function withAnswered(days: RecordDay[], answered: RecordItem[], today: string): RecordDay[] {
  const stored = new Set(days.flatMap((day) => day.items.map((item) => item.id)));
  const fresh = answered.filter((item) => !stored.has(item.id));
  if (fresh.length === 0) return days;
  const first = days[0];
  if (first && first.day === today) return [{ ...first, items: [...fresh, ...first.items] }, ...days.slice(1)];
  return [{ day: today, label: "Today", items: fresh }, ...days];
}

/**
 * What the agent did, newest day first: one line per proposal answered and per note, under a quiet day label. The
 * first RECORD_LINES lines show; the rest wait behind one "Show N more" (no inner scroll, owner rules 4 and 5).
 */
export function ActivityRecord({ days: stored, today }: { days: RecordDay[]; today: string }) {
  const [all, setAll] = React.useState(false);
  const headingId = React.useId();
  // A proposal answered on this page shows here at once, under today, until the page's refresh brings the stored line.
  const [answered, setAnswered] = React.useState<RecordItem[]>([]);
  React.useEffect(() => {
    const onAnswered = (event: Event) => {
      const item = (event as CustomEvent<ProposalAnsweredDetail>).detail?.item;
      if (item) setAnswered((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
    };
    window.addEventListener(PROPOSAL_ANSWERED_EVENT, onAnswered);
    return () => window.removeEventListener(PROPOSAL_ANSWERED_EVENT, onAnswered);
  }, []);
  const days = React.useMemo(() => withAnswered(stored, answered, today), [stored, answered, today]);
  const total = days.reduce((sum, day) => sum + day.items.length, 0);
  if (total === 0) return null;
  let left = all ? Number.POSITIVE_INFINITY : RECORD_LINES;
  const shown = days
    .map((day) => {
      const items = day.items.slice(0, Math.max(0, left));
      left -= items.length;
      return { ...day, items };
    })
    .filter((day) => day.items.length > 0);
  const hidden = total - shown.reduce((sum, day) => sum + day.items.length, 0);
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h2 id={headingId} className="px-1 pb-2 text-[15px] font-semibold leading-6 text-oa-fg">
        What I did
      </h2>
      <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
        {shown.map((day, index) => (
          <div key={day.day} className={index > 0 ? "border-t border-oa-border" : ""}>
            <p className="bg-oa-bg px-3.5 py-1.5 text-[12.5px] font-medium text-oa-muted-fg">{day.label}</p>
            <ul className="divide-y divide-oa-border border-t border-oa-border">
              {day.items.map((item) => (
                <Row key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))}
        {hidden > 0 || all ? (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((value) => !value)}
            className={`block w-full border-t border-oa-border px-3.5 py-2.5 text-left text-[13.5px] font-medium text-oa-primary hover:bg-oa-accent ${FOCUS}`}
          >
            {all ? "Show less" : `Show ${hidden} more`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
