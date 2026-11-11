import Link from "next/link";

import { SERIES_VARS } from "@/components/backtest/format";
import { FOCUS } from "@/components/oa/kit";
import { firstFullSentence } from "@/lib/plain-copy";
import { signedPct } from "@/lib/memo/format";
import type { MemoHistoryRow } from "@/lib/memo/store";
import { gapWords } from "@/lib/memo/view";
import { shortDay, weekTitle } from "@/lib/memo/week";

import { MiniBars } from "./mini-bars";

/**
 * Every week's memo, newest first, each one tap away: two bars (the portfolio
 * and the S&P 500, on one scale for every week) and the gap in a line. Weeks
 * written before the memo had figures show their first sentence. The one on
 * screen is marked.
 */
export function MemoHistory({ rows, current, latestKey, example }: { rows: MemoHistoryRow[]; current: string; latestKey: string; example: boolean }) {
  if (rows.length <= 1) return null;
  const scale = Math.max(
    0.5,
    ...rows.flatMap((row) => [row.portfolioPct, row.marketPct].filter((value): value is number => typeof value === "number").map(Math.abs)),
  );
  return (
    <nav aria-label="Earlier memos" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-oa-border px-4 py-2">
        <h2 className="oa-label">Every week</h2>
        <span aria-hidden="true" className={`${SERIES_VARS} flex items-center gap-3 text-[11.5px] text-oa-muted-fg`}>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-[var(--series-a)]" />
            {example ? "Example" : "Yours"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-3 rounded-full bg-[var(--series-b)]" />
            S&amp;P 500
          </span>
        </span>
      </div>
      {/* About eight weeks in view, then it scrolls inside. */}
      <ol className="max-h-[42rem] divide-y divide-oa-border overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  <span className={`text-[14px] font-medium ${selected ? "text-oa-primary" : "text-oa-fg"}`}>{weekTitle(row)}</span>
                  <span className="oa-mono shrink-0 text-[11.5px] tabular-nums text-oa-muted-fg">{row.complete ? `to ${shortDay(row.friday)}` : "so far"}</span>
                </span>
                {mine !== null ? (
                  <>
                    <MiniBars
                      className="mt-1.5"
                      hideLabels
                      domain={[-scale, scale]}
                      bars={[
                        { label: example ? "Example" : "Yours", value: mine, text: signedPct(mine), series: "a" },
                        ...(market !== null ? [{ label: "S&P 500", value: market, text: signedPct(market), series: "b" as const }] : []),
                      ]}
                    />
                    {market !== null ? <span className="mt-1 block text-[12.5px] leading-[18px] text-oa-muted-fg">{capital(gapWords(mine, market))}</span> : null}
                  </>
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

const capital = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
