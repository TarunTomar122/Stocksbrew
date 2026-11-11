import Link from "next/link";

import { FOCUS } from "@/components/oa/kit";
import { firstFullSentence } from "@/lib/plain-copy";
import { pct, signedPct } from "@/lib/memo/format";
import type { MemoHistoryRow } from "@/lib/memo/store";
import { gapWords } from "@/lib/memo/view";
import { weekTitle } from "@/lib/memo/week";

/**
 * Every week's memo, newest first, each one tap away: the portfolio's week as
 * one figure and the gap to the S&P 500 in a line under it (no bars beside the
 * numbers, owner rule 5). Weeks written before the memo had figures show their
 * first sentence. The one on screen is marked.
 */
export function MemoHistory({ rows, current, latestKey, example }: { rows: MemoHistoryRow[]; current: string; latestKey: string; example: boolean }) {
  if (rows.length <= 1) return null;
  return (
    <nav aria-label={example ? "The example's earlier memos" : "Earlier memos"} className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card lg:flex lg:max-h-full lg:flex-col">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-oa-border px-4 py-2">
        <h2 className="oa-label">Every week</h2>
        <span className="whitespace-nowrap text-[12px] text-oa-muted-fg">against the S&amp;P 500</span>
      </div>
      {/* About eight weeks in view, then it scrolls inside. */}
      <ol className="max-h-[42rem] divide-y divide-oa-border overflow-y-auto [scrollbar-width:none] lg:min-h-0 lg:flex-1 [&::-webkit-scrollbar]:hidden">
        {rows.map((row) => {
          const selected = row.weekKey === current;
          const href = row.weekKey === latestKey ? "/portfolio/memo" : `/portfolio/memo?week=${row.weekKey}`;
          const mine = typeof row.portfolioPct === "number" ? row.portfolioPct : null;
          const market = typeof row.marketPct === "number" ? row.marketPct : null;
          return (
            <li key={row.weekKey}>
              <Link
                href={href}
                aria-current={selected ? "page" : undefined}
                className={`block px-4 py-2.5 transition-colors hover:bg-oa-bg ${selected ? "bg-oa-bg" : ""} ${FOCUS}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[14px] font-medium ${selected ? "text-oa-primary" : "text-oa-fg"}`}>
                    {weekTitle(row)}
                    {row.complete ? null : <span className="font-normal text-oa-muted-fg"> so far</span>}
                  </span>
                  {mine !== null ? (
                    <span className={`oa-mono shrink-0 text-[14px] font-medium tabular-nums ${mine > 0 ? "text-signal-bullish" : mine < 0 ? "text-signal-bearish" : "text-oa-fg"}`}>{signedPct(mine)}</span>
                  ) : null}
                </span>
                {mine !== null ? (
                  <span className="mt-0.5 block text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
                    {market !== null ? `${capital(gapWords(mine, market))}, which ${marketWords(market)}.` : "No S&P 500 figure for this week."}
                  </span>
                ) : (
                  <span className="mt-0.5 block text-pretty text-[13px] leading-[19px] text-oa-muted-fg">{row.headline || firstFullSentence(row.topLine)}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "rose 2.0%", "fell 0.6%", "was flat". */
const marketWords = (value: number) => (Math.abs(value) < 0.05 ? "was flat" : `${value > 0 ? "rose" : "fell"} ${pct(Math.abs(value))}`);

const capital = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
