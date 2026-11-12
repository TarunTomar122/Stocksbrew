import Link from "next/link";
import type { ReactNode } from "react";

import type { CorrelationModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { Fold } from "./fold";
import { CARD, ChartCard, Module, NUM, SPAN, pct } from "./parts";

/** At most this many group cards, so the row stays one row of cards with the diversifier and the closest pair. */
const MAX_GROUP_CARDS = 2;

/**
 * Names that move as one, as what it means rather than a grid of numbers (owner, Nov 12: "what do i even get from
 * this?? this is analysis not insights"): each group that moves as one ("4 chip stocks move as one", 43% of the
 * money), the holding that moves least with the rest, and the pair that moves most alike, in words, no decimals.
 * Every pair stays one quiet click away under "See every pair".
 */
export function Together({ module, weights, example = false }: { module: CorrelationModule; weights?: Record<string, number>; example?: boolean }) {
  const money = example ? "of the money" : "of your money";
  const groups = module.groups.slice(0, MAX_GROUP_CARDS);
  // Results cached before the cards existed have neither; the cards then simply leave them out.
  const steadiest = module.steadiest ?? null;
  const closest = module.closest ?? null;
  // A group of exactly the closest two already says it.
  const pairInGroup = closest ? groups.some((group) => group.tickers.length === 2 && group.tickers.includes(closest.a.ticker) && group.tickers.includes(closest.b.ticker)) : false;
  const cards = [
    ...(groups.length > 0
      ? groups.map((group) => (
          <Insight key={group.tickers.join("-")} label="One bet in disguise" tickers={group.tickers}>
            <p className="text-[15px] font-medium leading-5 text-oa-fg">
              {group.tickers.length} {group.noun ?? "stocks"} move as one
            </p>
            <p className="text-[13px] leading-[18px] text-oa-muted-fg">
              <span className={`${NUM} text-[22px] font-medium leading-7 text-oa-fg`}>{pct(group.weight)}</span> {money}
            </p>
          </Insight>
        ))
      : [
          <Insight key="none" label="One bet in disguise" tickers={module.order.slice(0, 5).map((name) => name.ticker)} faint>
            <p className="text-[15px] font-medium leading-5 text-oa-fg">{example ? "These stocks" : "Your stocks"} move fairly independently</p>
            <p className="text-[13px] leading-[18px] text-oa-muted-fg">No three of them rise and fall as one.</p>
          </Insight>,
        ]),
    steadiest ? (
      <Insight key="steadiest" label={example ? "The steadiest diversifier" : "Your steadiest diversifier"} tickers={[steadiest.ticker]}>
        <p className="text-[15px] font-medium leading-5 text-oa-fg">{steadiest.ticker} moves least with the rest</p>
        <p className="text-[13px] leading-[18px] text-oa-muted-fg">
          <span className="text-oa-fg">{followWords(steadiest.together)}.</span> {followMeaning(steadiest.together)}
        </p>
      </Insight>
    ) : null,
    closest && !pairInGroup ? (
      <Insight key="closest" label={closest.together >= 0.4 ? "Biggest overlap" : "Closest pair"} tickers={[closest.a.ticker, closest.b.ticker]}>
        <p className="text-[15px] font-medium leading-5 text-oa-fg">
          {closest.a.ticker} and {closest.b.ticker} {pairWords(closest.together)}
        </p>
        <p className="text-[13px] leading-[18px] text-oa-muted-fg">{pairMeaning(closest.together)}</p>
      </Insight>
    ) : null,
  ].filter(Boolean);
  const cols = cards.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : cards.length === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : cards.length === 2 ? "sm:grid-cols-2" : "";
  return (
    <Module id="together" title="Names that move as one">
      <div className={`${SPAN[12]} grid grid-cols-1 gap-3 lg:gap-4 ${cols}`}>{cards}</div>
      {module.order.length >= 3 ? (
        <details className={`${SPAN[12]} group`}>
          <summary className="flex h-9 w-max cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:-ml-2 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">See every pair</span>
            <span className="hidden group-open:inline">Hide the pairs</span>
          </summary>
          <div className="mt-2">
            <Heatmap module={module} weights={weights} />
          </div>
        </details>
      ) : null}
    </Module>
  );
}

/** One insight: a quiet label, the logos it is about, then its words. The cards in a row share a height (grid stretch). */
function Insight({ label, tickers, faint = false, children }: { label: string; tickers: string[]; faint?: boolean; children: ReactNode }) {
  return (
    <div className={`${CARD} gap-2 px-4 py-3`}>
      <p className="text-[12.5px] leading-4 text-oa-muted-fg">{label}</p>
      <span className={`flex flex-wrap items-center gap-1.5 ${faint ? "opacity-60" : ""}`}>
        {tickers.map((ticker) => (
          <Link key={ticker} href={`/stock/${encodeURIComponent(ticker)}`} prefetch={false} title={ticker} className="rounded-full hover:ring-2 hover:ring-oa-primary">
            <StockLogo ticker={ticker} size={26} atOnce circle />
          </Link>
        ))}
      </span>
      {children}
    </div>
  );
}

/** Copper for moving together, a cool grey for moving apart. */
function cellColor(value: number): string {
  if (value >= 0) return `color-mix(in srgb, var(--oa-primary) ${Math.round(Math.min(1, value) * 85)}%, var(--oa-card))`;
  return `color-mix(in srgb, var(--signal-neutral) ${Math.round(Math.min(1, -value) * 70)}%, var(--oa-card))`;
}

/** Below this a pair barely moves together: its cell shows only its colour, the figure is on hover. */
const QUIET_BELOW = 0.3;

/** How a pair moves, in words: "move almost as one", "move closely together", "move loosely together", ... */
export function pairWords(value: number): string {
  if (value < 0) return "move apart";
  if (value >= 0.85) return "move almost as one";
  if (value >= 0.6) return "move closely together";
  if (value >= 0.4) return "move loosely together";
  return "barely move together";
}

/** What the closest pair means for the person, in a dozen words or fewer. */
export function pairMeaning(value: number): string {
  if (value >= 0.85) return "Owning both is close to owning one twice.";
  if (value >= 0.6) return "When one drops, the other usually drops too.";
  if (value >= 0.4) return "They often, not always, go the same way.";
  return "Even your closest pair mostly goes its own way.";
}

/** How the steadiest name follows the rest: barely, loosely, or still closely. */
export function followWords(value: number): string {
  if (value < 0.3) return "Barely follows the others";
  if (value < 0.6) return "Loosely follows the others";
  return "Still follows the others closely";
}

/** What that means, in a dozen words or fewer. */
export function followMeaning(value: number): string {
  if (value < 0.3) return "It can hold up when the rest fall together.";
  if (value < 0.6) return "It softens the swings a little.";
  return "Nothing here really offsets the rest.";
}

function corr(value: number): string {
  return value.toFixed(2).replace(/^0/, "").replace(/^-0/, "−");
}

/** The most names the heatmap shows before folding, so it stays a readable square on a laptop. */
const HEAT_CAP = 12;

function Heatmap({ module, weights }: { module: CorrelationModule; weights?: Record<string, number> }) {
  const n = module.order.length;
  // The heaviest twelve, kept in the heatmap's own order so close names still sit together.
  const heaviest = new Set(
    module.order
      .map((name, index) => ({ ticker: name.ticker, index, weight: weights?.[name.ticker] ?? -index }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, HEAT_CAP)
      .map((name) => name.index),
  );
  const short = module.order.map((_, index) => index).filter((index) => heaviest.has(index));
  const all = module.order.map((_, index) => index);
  return (
    <ChartCard title="How closely each pair moves" aside={<span className={NUM}>1 = in step</span>} className={SPAN[12]}>
      {/* Both versions go to the page only when there is something to fold. */}
      {n > short.length ? <Fold short={<Matrix module={module} rows={short} />} long={<Matrix module={module} rows={all} />} more={n - short.length} /> : <Matrix module={module} rows={all} />}
    </ChartCard>
  );
}

/**
 * The matrix for the given names (indexes into `order`), columns sharing the card's width (at least 28px each).
 * On a phone the row names are logos only; past about ten names it scrolls sideways, as a table may.
 */
function Matrix({ module, rows }: { module: CorrelationModule; rows: number[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-max gap-[2px] sm:min-w-0"
        style={{ gridTemplateColumns: `minmax(1.5rem, auto) repeat(${rows.length}, minmax(28px, 1fr))` }}
        role="table"
        aria-label="Correlation of daily moves"
      >
        <span />
        {rows.map((j) => (
          <span key={`h-${module.order[j]!.ticker}`} className="flex justify-center pb-1" title={module.order[j]!.ticker} role="columnheader">
            <StockLogo ticker={module.order[j]!.ticker} size={20} atOnce />
          </span>
        ))}
        {rows.map((i) => {
          const row = module.order[i]!;
          return (
            <div key={row.ticker} className="contents" role="row">
              <span className="flex items-center gap-1 pr-1" role="rowheader" title={row.ticker}>
                <StockLogo ticker={row.ticker} size={18} atOnce />
                <span className={`${NUM} text-[11px] text-oa-muted-fg max-sm:hidden`}>{row.ticker}</span>
              </span>
              {rows.map((j) => {
                const col = module.order[j]!;
                const value = module.matrix[i]![j]!;
                const strong = value >= 0.6;
                return (
                  <span
                    key={col.ticker}
                    role="cell"
                    title={`${row.ticker} and ${col.ticker}: ${value.toFixed(2)}`}
                    className={`${NUM} flex h-8 items-center justify-center rounded-[3px] text-[11px] lg:h-9 lg:text-[12px] ${strong ? "text-oa-primary-fg" : "text-oa-fg"}`}
                    style={{ background: i === j ? "var(--oa-bg)" : cellColor(value) }}
                  >
                    {i === j || Math.abs(value) < QUIET_BELOW ? "" : corr(value)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
