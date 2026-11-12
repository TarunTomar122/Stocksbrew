import type { OverlapModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { ChartCard, FigureCard, Key, LIST, MINE, Module, NUM, Tick, pct } from "./parts";

const VIA = "color-mix(in srgb, var(--oa-primary) 35%, transparent)";

/** Same stocks inside the funds: what the funds add to each company, and how much the funds repeat each other. */
export function Overlap({ module, example }: { module: OverlapModule; example: boolean }) {
  return (
    <Module id="overlap" title={example ? "What the funds add" : "What your funds add"}>
      {/* Two funds are one number; three or more get the grid. */}
      {module.matrix && module.matrix.funds.length === 2 ? (
        <FigureCard
          label={`${module.matrix.funds[0]} and ${module.matrix.funds[1]} share`}
          figure={pct(module.matrix.pct[0]![1]!)}
          line="of each fund sits in the same companies"
        />
      ) : null}
      {module.companies.length > 0 ? <Companies module={module} /> : null}
      {module.matrix && module.matrix.funds.length > 2 ? <Matrix matrix={module.matrix} /> : null}
    </Module>
  );
}

function Companies({ module }: { module: OverlapModule }) {
  const max = Math.max(1, ...module.companies.map((row) => row.weight));
  return (
    <ChartCard
      title="By company"
      newRow
      aside={
        <>
          <Key color={MINE}>Bought</Key>
          <Key color={VIA}>Through funds</Key>
        </>
      }
      flush
    >
      <ul className={`${LIST} px-4 py-2`}>
        {module.companies.map((row) => (
          <li key={row.ticker} className="grid h-8 grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_3rem]">
            <Tick ticker={row.ticker} />
            <span className="flex h-2.5 overflow-hidden rounded-[2px] bg-oa-bg" role="img" aria-label={`${row.ticker}: ${pct(row.directPct)} bought, ${pct(row.fundPct)} through ${row.via.join(", ")}`}>
              <span style={{ width: `${(row.directPct / max) * 100}%`, background: MINE }} />
              <span style={{ width: `${(row.fundPct / max) * 100}%`, background: VIA }} />
            </span>
            <span className={`${NUM} text-right text-[13px] text-oa-fg`}>{pct(row.weight)}</span>
          </li>
        ))}
      </ul>
      {module.closed.length > 0 ? (
        <p className="mt-auto border-t border-oa-border px-4 py-2 text-[12.5px] leading-4 text-oa-muted-fg">
          {module.closed.join(", ")} cannot be opened, {pct(module.closedPct)} of the money
        </p>
      ) : null}
    </ChartCard>
  );
}

function Matrix({ matrix }: { matrix: NonNullable<OverlapModule["matrix"]> }) {
  const n = matrix.funds.length;
  return (
    <ChartCard title="How much the funds repeat" wide={n > 3}>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid w-max gap-[2px]" style={{ gridTemplateColumns: `52px repeat(${n}, 52px)` }} role="table" aria-label="Fund overlap">
          <span />
          {matrix.funds.map((fund) => (
            <span key={`h-${fund}`} className="flex flex-col items-center gap-0.5 pb-1" role="columnheader">
              <StockLogo ticker={fund} size={18} atOnce />
              <span className={`${NUM} text-[11px] text-oa-muted-fg`}>{fund}</span>
            </span>
          ))}
          {matrix.funds.map((row, i) => (
            <div key={row} className="contents" role="row">
              <span className="flex items-center gap-1" role="rowheader">
                <StockLogo ticker={row} size={18} atOnce />
                <span className={`${NUM} text-[11px] text-oa-muted-fg`}>{row}</span>
              </span>
              {matrix.funds.map((col, j) => {
                const value = matrix.pct[i]![j]!;
                return (
                  <span
                    key={col}
                    role="cell"
                    className={`${NUM} flex h-10 items-center justify-center rounded-[3px] text-[12px] ${i !== j && value >= 45 ? "text-oa-primary-fg" : "text-oa-fg"}`}
                    style={{ background: i === j ? "var(--oa-bg)" : `color-mix(in srgb, var(--oa-primary) ${Math.round(Math.min(100, value) * 0.85)}%, var(--oa-card))` }}
                    title={i === j ? row : `${row} and ${col} share ${pct(value)}`}
                  >
                    {i === j ? "" : pct(value)}
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
