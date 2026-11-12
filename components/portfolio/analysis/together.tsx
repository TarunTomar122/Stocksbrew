import type { CorrelationModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { ChartCard, FigureCard, Module, NUM, pct } from "./parts";

/**
 * Names that move as one: each group as a figure card (its logos, how much money it holds, how closely it moves),
 * then every pair as a heatmap ordered so close names sit together. The numbers are printed in the cells: the
 * colour only backs them up.
 */
export function Together({ module }: { module: CorrelationModule }) {
  return (
    <Module id="together" title="Names that move as one">
      {module.groups.map((group) => (
        <FigureCard
          key={group.tickers.join("-")}
          label={
            <span className="flex flex-wrap items-center gap-1">
              {group.tickers.map((ticker) => (
                <span key={ticker} title={ticker}>
                  <StockLogo ticker={ticker} size={20} atOnce />
                </span>
              ))}
            </span>
          }
          figure={pct(group.weight)}
          line={`of the money, in step at ${group.together.toFixed(2)}`}
        />
      ))}
      {module.order.length >= 3 ? <Heatmap module={module} /> : null}
    </Module>
  );
}

/** Copper for moving together, a cool grey for moving apart. */
function cellColor(value: number): string {
  if (value >= 0) return `color-mix(in srgb, var(--oa-primary) ${Math.round(Math.min(1, value) * 85)}%, var(--oa-card))`;
  return `color-mix(in srgb, var(--signal-neutral) ${Math.round(Math.min(1, -value) * 70)}%, var(--oa-card))`;
}

function Heatmap({ module }: { module: CorrelationModule }) {
  const n = module.order.length;
  return (
    <ChartCard title="How closely each pair moves" aside={<span className={NUM}>1 = in step</span>} newRow>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid w-max gap-[2px]" style={{ gridTemplateColumns: `4.25rem repeat(${n}, minmax(30px, 40px))` }} role="table" aria-label="Correlation of daily moves">
          <span />
          {module.order.map((name) => (
            <span key={`h-${name.ticker}`} className="flex justify-center pb-1" title={name.ticker} role="columnheader">
              <StockLogo ticker={name.ticker} size={20} atOnce />
            </span>
          ))}
          {module.order.map((row, i) => (
            <div key={row.ticker} className="contents" role="row">
              <span className="flex items-center gap-1" role="rowheader">
                <StockLogo ticker={row.ticker} size={18} atOnce />
                <span className={`${NUM} text-[11px] text-oa-muted-fg`}>{row.ticker}</span>
              </span>
              {module.order.map((col, j) => {
                const value = module.matrix[i]![j]!;
                const strong = value >= 0.6;
                return (
                  <span
                    key={col.ticker}
                    role="cell"
                    title={`${row.ticker} and ${col.ticker}: ${value.toFixed(2)}`}
                    className={`${NUM} flex h-8 items-center justify-center rounded-[3px] text-[11px] ${strong ? "text-oa-primary-fg" : "text-oa-fg"}`}
                    style={{ background: i === j ? "var(--oa-bg)" : cellColor(value) }}
                  >
                    {i === j ? "" : value.toFixed(2).replace(/^0/, "").replace(/^-0/, "−")}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
