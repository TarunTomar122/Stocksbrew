import Link from "next/link";

import { NUM } from "@/components/basket-agent/parts";
import { StockLogo } from "@/components/stock-logo";
import type { BasketAgent } from "@/lib/basket-agent/model";
import { capitalize, dayWords } from "@/lib/day-words";
import { STATUS_WORDS, thesisHref, type ThesisState } from "@/lib/thesis-monitor/model";

import { CountBar, STATUS_TEXT } from "./parts";

const LINK =
  "inline-flex h-8 items-center rounded-lg border border-oa-border bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))]";

/**
 * The person's theses on /agents, under their own heading: one row per thesis (its first logos, the name, the status
 * and how many lines hold, when it was checked), the row itself the link. One "Write a thesis" in the header.
 */
export function ThesisList({
  theses,
  states,
  today,
  overPlan = new Set<string>(),
}: {
  /** Baskets that carry a thesis: over holdings, or an idea basket with lines. */
  theses: BasketAgent[];
  states: Readonly<Record<string, ThesisState | undefined>>;
  today: string;
  overPlan?: ReadonlySet<string>;
}) {
  return (
    <section aria-labelledby="theses" className="oa-surface mt-4 min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
        <h2 id="theses" className="flex items-baseline gap-2 text-[16px] font-semibold text-oa-fg">
          Theses
          {theses.length > 0 ? <span className={`${NUM} text-[14px] text-oa-primary`}>{theses.length}</span> : null}
        </h2>
        <Link prefetch={false} href="/agents/theses/new" className={LINK}>
          Write a thesis
        </Link>
      </div>
      {theses.length === 0 ? (
        <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">Say what you believe about your holdings, and give each one a line to hold.</p>
      ) : (
        <ul className="divide-y divide-oa-border">
          {theses.map((basket) => {
            const state = states[basket.id] ?? null;
            const tickers = basket.thesis?.lines.map((line) => line.ticker) ?? [];
            return (
              <li key={basket.id} className="relative flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-oa-accent">
                <span className="flex shrink-0 -space-x-1.5">
                  {tickers.slice(0, 4).map((ticker) => (
                    <StockLogo key={ticker} ticker={ticker} size={22} />
                  ))}
                </span>
                <span className="min-w-0 flex-1 leading-5">
                  <Link prefetch={false} href={thesisHref(basket.id)} className="block truncate text-[14.5px] font-medium text-oa-fg after:absolute after:inset-0">
                    {basket.name}
                  </Link>
                  <span className={`${NUM} block text-[12.5px] text-oa-muted-fg`}>
                    {state ? (
                      <>
                        <span className={STATUS_TEXT[state.status]}>{STATUS_WORDS[state.status]}</span> · {state.counts.holds} of {state.counts.lines} lines hold
                      </>
                    ) : (
                      `${tickers.length} ${tickers.length === 1 ? "company" : "companies"}`
                    )}
                  </span>
                </span>
                {state ? <CountBar counts={state.counts} className="hidden w-28 shrink-0 sm:flex" /> : null}
                <span className="w-24 shrink-0 text-right text-[12.5px] leading-5 text-oa-muted-fg">
                  {!basket.enabled ? "Paused" : overPlan.has(basket.id) ? "Paused by your plan" : state ? capitalize(dayWords(state.day, today)) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
