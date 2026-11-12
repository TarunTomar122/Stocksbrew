import Link from "next/link";

import { SectorIcon } from "@/components/oa/sector-icon";
import { StockLogo } from "@/components/stock-logo";
import type { ConcentrationModule, SectorName } from "@/lib/portfolio-analysis/types";

import { ChartCard, FigureCard, Module, NUM, SPAN, Tick, pct } from "./parts";

/** One sector row from `sm` (a phone's row is two lines, the names under the sector). */
const ROW_PX = 36;
/** The three figures stacked, less the sectors card's own head: what the rows must at least fill to sit beside them. */
const BESIDE_PX = 288;

/**
 * How the money sits: the sectors table (7 columns) beside the three figures stacked (5), both ending level. The
 * figures set the row's height and the sector list fills the rest of its card, scrolling inside past that, so the
 * table goes beside the figures only when its rows reach that far (with the S&P 500's sectors there are always ten
 * or eleven). Fewer rows, or fewer figures, and the figures sit in a row above the table across the page. On a
 * phone the figures come first.
 */
export function Concentration({ module, example }: { module: ConcentrationModule; example: boolean }) {
  const sp = module.sp;
  const lines = module.basis === "look-through" ? "companies" : "holdings";
  const spread = module.equalBets >= 9.95 ? Math.round(module.equalBets).toString() : module.equalBets.toFixed(1);
  const sectors = module.sectors.length > 0;
  const count = (module.largest ? 1 : 0) + (module.top5Tickers.length > 1 ? 2 : 0);
  const footer = module.unplacedPct >= 0.5;
  const beside = sectors && count === 3 && module.sectors.length * ROW_PX + (footer ? 33 : 0) >= BESIDE_PX;
  const row = count === 3 ? "sm:grid-cols-3" : count === 2 ? "sm:grid-cols-2" : "";
  const fill = beside ? "lg:flex-1" : "";
  return (
    <Module id="concentration" title={example ? "How the money sits" : "How your money sits"}>
      <div className={`grid min-w-0 grid-cols-1 gap-3 lg:gap-4 ${beside ? `${SPAN[5]} lg:order-2 lg:flex lg:flex-col` : `${SPAN[12]} ${row}`}`}>
      {module.largest ? (
        <FigureCard
          className={fill}
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
        className={fill}
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
          className={fill}
          label="Spread like"
          figure={`${spread} equal bets`}
          line={sp.equalBets !== null ? `The S&P 500 spreads like ${Math.round(sp.equalBets)}` : undefined}
        />
      ) : null}
      </div>
      {sectors ? <Sectors module={module} beside={beside} /> : null}
    </Module>
  );
}

/**
 * Sectors as a compact table: the share of the money, the S&P 500's, and two or three names per row, the person's
 * own in a solid chip and the S&P 500's largest (for a sector they skip or hold far less of) in a dashed one. The
 * names cell is one line tall and clips whole chips that do not fit, so a narrow card shows fewer, never half of one.
 * Beside the figures the card takes the row's height (`h-0` plus `min-h-full`: it adds nothing to the height and
 * then fills it) and the list scrolls inside past that. On a phone the names go under the sector name.
 */
function Sectors({ module, beside }: { module: ConcentrationModule; beside: boolean }) {
  const rows = module.sectors;
  const anySp = rows.some((row) => row.spPct !== null);
  // Results cached before the names were added have none: the column then stays out.
  const anyNames = rows.some((row) => (row.names ?? []).length > 0);
  const anyIdeas = rows.some((row) => (row.names ?? []).some((name) => name.idea));
  const grid = `grid items-center gap-x-3 ${
    anyNames
      ? "grid-cols-[minmax(0,1fr)_3.5rem_4rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.75rem_4.25rem]"
      : "grid-cols-[minmax(0,1fr)_3.5rem_4rem] sm:grid-cols-[minmax(0,1fr)_3.75rem_4.25rem]"
  }`;
  // Names under the sector on a phone (second line, all three columns), their own column from `sm`.
  const youCol = anyNames ? "col-start-2 row-start-1 sm:col-start-3" : "";
  const spCol = anyNames ? "col-start-3 row-start-1 sm:col-start-4" : "";
  const list = beside
    ? "max-lg:max-h-[24rem] lg:min-h-0 lg:flex-1"
    : "max-h-[24rem] sm:max-h-[20.25rem]";
  return (
    <ChartCard
      title={module.basis === "look-through" ? "Sectors, funds opened" : "Sectors"}
      flush
      className={beside ? `${SPAN[7]} lg:order-1 lg:h-0 lg:min-h-full` : SPAN[12]}
    >
      <div className={`${grid} border-b border-oa-border px-4 py-1.5 text-[12px] leading-4 text-oa-muted-fg`}>
        <span>Sector</span>
        {anyNames ? <span className="max-sm:hidden">{anyIdeas ? "Yours / Ideas" : "Yours"}</span> : null}
        <span className={`${youCol} text-right`}>You</span>
        <span className={`${spCol} text-right`}>{anySp ? "S&P 500" : ""}</span>
      </div>
      <ul className={`${list} overflow-y-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {rows.map((row) => (
          <li key={row.sector} className={`${grid} gap-y-1 py-1.5 sm:h-9 sm:py-0`}>
            <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-[13px] leading-5 text-oa-fg" title={row.sector}>
              <SectorIcon id={row.sector} size={15} />
              <span className="truncate">{row.sector}</span>
            </span>
            {anyNames ? (
              <span className="col-span-3 col-start-1 row-start-2 flex h-6 min-w-0 flex-wrap gap-1 overflow-hidden pl-[23px] sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:pl-0">
                {(row.names ?? []).map((name) => (
                  <NameChip key={name.ticker} name={name} sector={row.sector} />
                ))}
              </span>
            ) : null}
            <span className={`${youCol} ${NUM} text-right text-[13px] text-oa-fg`}>{pct(row.pct)}</span>
            <span className={`${spCol} ${NUM} text-right text-[13px] text-oa-muted-fg`}>{row.spPct !== null ? pct(row.spPct) : anySp ? "–" : ""}</span>
          </li>
        ))}
      </ul>
      {module.unplacedPct >= 0.5 ? (
        <p className="mt-auto border-t border-oa-border px-4 py-2 text-[12.5px] leading-4 text-oa-muted-fg">{pct(module.unplacedPct)} of the money we cannot place in a company</p>
      ) : null}
    </ChartCard>
  );
}

/** A name on a sector row: logo and ticker to the stock page; an idea in a dashed, quieter chip. */
function NameChip({ name, sector }: { name: SectorName; sector: string }) {
  return (
    <Link
      href={`/stock/${encodeURIComponent(name.ticker)}`}
      prefetch={false}
      title={name.idea ? `${name.name}, one of the S&P 500's largest in ${sector}` : name.name}
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[12px] leading-4 transition-colors hover:border-oa-fg ${
        name.idea ? "border-dashed border-oa-border text-oa-muted-fg" : "border-oa-border bg-oa-bg text-oa-fg"
      }`}
    >
      <StockLogo ticker={name.ticker} size={14} atOnce />
      <span className={`${NUM} font-medium`}>{name.ticker}</span>
    </Link>
  );
}
