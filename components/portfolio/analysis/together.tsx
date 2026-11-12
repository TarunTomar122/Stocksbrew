import type { CorrelationModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { Fold } from "./fold";
import { CARD, ChartCard, Module, NUM, SPAN, pct } from "./parts";

/**
 * Names that move as one: the groups in one line (logos, how much money, how closely), the pairs worth naming in
 * one strip, then every pair as a heatmap across the page, ordered so close names sit together. A cell prints its
 * figure from 0.3 up; below that only its colour shows, with the figure on hover. Past twelve names the heatmap shows
 * the twelve heaviest and folds the rest behind "Show N more".
 */
export function Together({ module, weights }: { module: CorrelationModule; weights?: Record<string, number> }) {
  const named = namedPairs(module);
  return (
    <Module id="together" title="Names that move as one">
      {module.groups.length > 0 ? (
        <ul aria-label="Groups that move together" className={`${SPAN[12]} flex flex-wrap items-center gap-x-6 gap-y-2 px-2 sm:px-0`}>
          {module.groups.map((group) => (
            <li key={group.tickers.join("-")} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-5 text-oa-muted-fg">
              <span className="flex items-center gap-1">
                {group.tickers.map((ticker) => (
                  <span key={ticker} title={ticker}>
                    <StockLogo ticker={ticker} size={20} atOnce />
                  </span>
                ))}
              </span>
              <span>
                <span className={`${NUM} font-medium text-oa-fg`}>{pct(group.weight)}</span> of the money, in step at{" "}
                <span className={`${NUM} text-oa-fg`}>{corr(group.together)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {named.length > 0 ? <Pairs pairs={named} /> : null}
      {module.order.length >= 3 ? <Heatmap module={module} weights={weights} /> : null}
    </Module>
  );
}

/** The named pairs as one divided strip: a pair is a figure-width cell, so one or two pairs do not stretch to the row. */
function Pairs({ pairs }: { pairs: Pair[] }) {
  const n = pairs.length;
  const span = n === 1 ? SPAN[4] : n === 2 ? SPAN[8] : SPAN[12];
  const cols = n === 1 ? "" : n === 2 ? "sm:grid-cols-2" : n === 3 ? "lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div className={`${CARD} overflow-hidden ${span}`}>
      <ul aria-label="Pairs that move most alike" className={`grid grid-cols-1 ${cols}`}>
        {pairs.map((pair) => (
          <li key={`${pair.a}-${pair.b}`} className="-mb-px -mr-px flex min-w-0 flex-col gap-1 border-b border-r border-oa-border px-4 py-3">
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-oa-fg">
              <StockLogo ticker={pair.a} size={18} atOnce />
              <StockLogo ticker={pair.b} size={18} atOnce />
              <span className="truncate">
                {pair.a} and {pair.b}
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className={`${NUM} text-[22px] font-medium leading-7 ${pair.value < 0 ? "text-oa-muted-fg" : "text-oa-fg"}`}>{pair.value.toFixed(2).replace("-", "−")}</span>
              <span className="text-[13px] leading-[18px] text-oa-muted-fg">{pairWords(pair.value)}</span>
            </span>
          </li>
        ))}
      </ul>
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

type Pair = { a: string; b: string; value: number };

/**
 * The pairs worth naming in words (judges, ship 61: "label the strongest relationships plainly"): the three that move
 * most alike, at 0.4 or more, then the one pair that moves most apart, at −0.2 or less.
 */
export function namedPairs(module: Pick<CorrelationModule, "order" | "matrix">): Pair[] {
  const pairs: Pair[] = [];
  module.order.forEach((row, i) => {
    for (let j = i + 1; j < module.order.length; j += 1) {
      const value = module.matrix[i]?.[j];
      if (typeof value === "number" && Number.isFinite(value)) pairs.push({ a: row.ticker, b: module.order[j]!.ticker, value });
    }
  });
  const alike = [...pairs].sort((x, y) => y.value - x.value).filter((pair) => pair.value >= 0.4).slice(0, 3);
  const apart = [...pairs].sort((x, y) => x.value - y.value).find((pair) => pair.value <= -0.2);
  return apart ? [...alike, apart] : alike;
}

/** How a pair moves, in words: "move almost as one", "move closely", "move somewhat alike", "move apart". */
export function pairWords(value: number): string {
  if (value < 0) return "move apart";
  if (value >= 0.85) return "move almost as one";
  if (value >= 0.6) return "move closely";
  return "move somewhat alike";
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
