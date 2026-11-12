import { SectorIcon } from "@/components/oa/sector-icon";
import type { ConcentrationModule } from "@/lib/portfolio-analysis/types";

import { ChartCard, FigureCard, LIST, Module, NUM, SPAN, Tick, pct } from "./parts";

/**
 * How the money sits: the sectors table (7 columns) beside the three figures stacked (5), about the same height,
 * so neither column ends halfway. On a phone the figures come first. Without sectors the figures sit in a row.
 */
export function Concentration({ module, example }: { module: ConcentrationModule; example: boolean }) {
  const sp = module.sp;
  const lines = module.basis === "look-through" ? "companies" : "holdings";
  const spread = module.equalBets >= 9.95 ? Math.round(module.equalBets).toString() : module.equalBets.toFixed(1);
  const sectors = module.sectors.length > 0;
  return (
    <Module id="concentration" title={example ? "How the money sits" : "How your money sits"}>
      <div className={`grid min-w-0 grid-cols-1 gap-3 lg:gap-4 ${sectors ? `${SPAN[5]} lg:order-2` : `${SPAN[12]} lg:grid-cols-3`}`}>
      {module.largest ? (
        <FigureCard
          label={
            <span className="inline-flex items-center gap-1.5">
              Largest <Tick ticker={module.largest.ticker} size={16} />
            </span>
          }
          figure={pct(module.largest.weight)}
          line={sp.largest ? `S&P 500's largest, ${sp.largest.ticker}, is ${pct(sp.largest.weight)}` : undefined}
        />
      ) : null}
      {module.top5Tickers.length > 1 ? (
      <FigureCard
        label={`Top ${Math.min(5, module.top5Tickers.length)} ${lines} together`}
        figure={pct(module.top5)}
        line={sp.top5 !== null ? `S&P 500's top five: ${pct(sp.top5)}` : undefined}
      >
        <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1">
          {module.top5Tickers.map((ticker) => (
            <Tick key={ticker} ticker={ticker} size={14} />
          ))}
        </span>
      </FigureCard>
      ) : null}
      {module.top5Tickers.length > 1 ? (
        <FigureCard
          label="Spread like"
          figure={`${spread} equal bets`}
          line={sp.equalBets !== null ? `The S&P 500 spreads like ${Math.round(sp.equalBets)}` : undefined}
        />
      ) : null}
      </div>
      {sectors ? <Sectors module={module} /> : null}
    </Module>
  );
}

/**
 * Sectors as a compact table: the share of the money and the S&P 500's beside it. No bars: they only drew the two
 * numbers printed next to them (owner rule 5).
 */
function Sectors({ module }: { module: ConcentrationModule }) {
  const rows = module.sectors;
  const anySp = rows.some((row) => row.spPct !== null);
  const grid = "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3";
  return (
    <ChartCard title={module.basis === "look-through" ? "Sectors, funds opened" : "Sectors"} flush className={`${SPAN[7]} lg:order-1`}>
      <div className={`${grid} border-b border-oa-border px-4 py-1.5 text-[12px] leading-4 text-oa-muted-fg`}>
        <span>Sector</span>
        <span className="text-right">You</span>
        <span className="text-right">{anySp ? "S&P 500" : ""}</span>
      </div>
      <ul className={`${LIST} px-4 py-1`}>
        {rows.map((row) => (
          <li key={row.sector} className={`${grid} h-8`}>
            <span className="flex min-w-0 items-center gap-2 text-[13px] leading-5 text-oa-fg" title={row.sector}>
              <SectorIcon id={row.sector} size={15} />
              <span className="truncate">{row.sector}</span>
            </span>
            <span className={`${NUM} text-right text-[13px] text-oa-fg`}>{pct(row.pct)}</span>
            <span className={`${NUM} text-right text-[13px] text-oa-muted-fg`}>{row.spPct !== null ? pct(row.spPct) : anySp ? "–" : ""}</span>
          </li>
        ))}
      </ul>
      {module.unplacedPct >= 0.5 ? (
        <p className="mt-auto border-t border-oa-border px-4 py-2 text-[12.5px] leading-4 text-oa-muted-fg">{pct(module.unplacedPct)} of the money we cannot place in a company</p>
      ) : null}
    </ChartCard>
  );
}
