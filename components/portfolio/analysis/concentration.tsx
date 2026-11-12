import type { ConcentrationModule } from "@/lib/portfolio-analysis/types";

import { ChartCard, FigureCard, Key, LIST, MINE, Module, NUM, SP, Tick, pct } from "./parts";

/** How the money sits: largest, top five and spread against the S&P 500, then sectors side by side. */
export function Concentration({ module, example }: { module: ConcentrationModule; example: boolean }) {
  const sp = module.sp;
  const lines = module.basis === "look-through" ? "companies" : "holdings";
  const spread = module.equalBets >= 9.95 ? Math.round(module.equalBets).toString() : module.equalBets.toFixed(1);
  return (
    <Module id="concentration" title={example ? "How the money sits" : "How your money sits"}>
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
      {module.sectors.length > 0 ? <Sectors module={module} /> : null}
    </Module>
  );
}

function Sectors({ module }: { module: ConcentrationModule }) {
  const rows = module.sectors;
  const max = Math.max(1, ...rows.map((row) => Math.max(row.pct, row.spPct ?? 0)));
  const anySp = rows.some((row) => row.spPct !== null);
  return (
    <ChartCard
      title={module.basis === "look-through" ? "Sectors, funds opened" : "Sectors"}
      aside={
        anySp ? (
          <>
            <Key color={MINE}>You</Key>
            <Key color={SP}>S&amp;P 500</Key>
          </>
        ) : undefined
      }
      flush
      newRow
    >
      <ul className={`${LIST} px-4 py-3`}>
        {rows.map((row) => (
          <li key={row.sector} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_5.5rem] items-center gap-3 py-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_6rem]">
            <span className="truncate text-[13px] leading-5 text-oa-fg" title={row.sector}>
              {row.sector}
            </span>
            <span className="flex flex-col gap-[3px]" role="img" aria-label={`${row.sector}: ${pct(row.pct)}${row.spPct !== null ? `, S&P 500 ${pct(row.spPct)}` : ""}`}>
              <span className="h-2 rounded-[2px]" style={{ width: `${Math.max(row.pct > 0 ? 1 : 0, (row.pct / max) * 100)}%`, background: MINE }} />
              {row.spPct !== null ? <span className="h-2 rounded-[2px]" style={{ width: `${Math.max(row.spPct > 0 ? 1 : 0, (row.spPct / max) * 100)}%`, background: SP }} /> : null}
            </span>
            <span className={`${NUM} text-right text-[12.5px] leading-4`}>
              <span className="text-oa-fg">{pct(row.pct)}</span>
              {row.spPct !== null ? <span className="text-oa-muted-fg"> · {pct(row.spPct)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {module.unplacedPct >= 0.5 ? (
        <p className="mt-auto border-t border-oa-border px-4 py-2 text-[12.5px] leading-4 text-oa-muted-fg">{pct(module.unplacedPct)} of the money we cannot place in a company</p>
      ) : null}
    </ChartCard>
  );
}
