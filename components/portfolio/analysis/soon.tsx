import Link from "next/link";

import type { CallsModule, EarningsModule, IncomeModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { ChartCard, DOWN, FLAT, Key, LIST, MINE, Module, NUM, SPAN, Tick, UP, day, money, monthName, pct, signedPct } from "./parts";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * What reports soon, where our calls sit and what the holdings should pay: the free part about the person's own
 * lines. The two-week strip (7 columns) beside the calls (5), both ending level: the cards stretch to the row and the
 * strip's day tiles grow into any height the calls add. The dividends run across the page under them. When nothing
 * reports for two weeks the earnings card is one short line, so it sits across the page above the calls rather than
 * beside them with an empty half.
 */
export function Ahead({
  earnings,
  calls,
  income,
  example,
  showUpsell,
}: {
  earnings: EarningsModule | null;
  calls: CallsModule | null;
  income: IncomeModule | null;
  example: boolean;
  showUpsell: boolean;
}) {
  if (!earnings && !calls && !income) return null;
  const quiet = Boolean(earnings?.next);
  const beside = Boolean(earnings && calls && !quiet);
  // Rough body heights in px (the card heads match), to pick which card gives way. The strip's tiles can grow, so a
  // taller calls card stretches the earnings card; a taller earnings card instead scrolls its list inside the calls
  // card's height, when that still leaves the strip and two rows.
  const reporting = earnings ? earnings.days.reduce((sum, slot) => sum + slot.tickers.length, 0) : 0;
  const earningsPx = 120 + 32 * Math.min(reporting, 8.25);
  const callsPx = calls
    ? 40 + 26 * [calls.split.buyMore, calls.split.keep, calls.split.sellSome, calls.split.none].filter((value) => value > 0).length +
      (calls.rows.length > 0 ? 16 + 32 * Math.min(calls.rows.length, 8.25) : 0) +
      (showUpsell && calls.withheld > 0 ? 33 : 0)
    : 0;
  const earningsGives = beside && callsPx < earningsPx && callsPx >= 120 + 64;
  return (
    <Module id="ahead" title="Coming up, and our calls">
      {earnings ? (
        <Earnings
          module={earnings}
          example={example}
          className={beside ? `${SPAN[7]} ${earningsGives ? "lg:h-0 lg:min-h-full" : "lg:self-stretch"}` : SPAN[12]}
          fill={earningsGives}
        />
      ) : null}
      {calls ? <Calls module={calls} showUpsell={showUpsell} example={example} className={beside ? `${SPAN[5]} lg:self-stretch` : SPAN[12]} wide={!beside} /> : null}
      {income ? <Income module={income} /> : null}
    </Module>
  );
}

function Earnings({ module, example, className, fill = false }: { module: EarningsModule; example: boolean; className: string; fill?: boolean }) {
  const money_ = example ? "the money" : "your money";
  return (
    <ChartCard
      title="Reports in the next two weeks"
      className={className}
      aside={module.next ? undefined : <span className={NUM}>{pct(module.reportingPct)} of {money_}</span>}
    >
      {module.next ? (
        <div className="flex items-center gap-3">
          <StockLogo ticker={module.next.ticker} size={28} atOnce />
          <div>
            <p className={`${NUM} text-[22px] font-medium leading-7 text-oa-fg`}>{day(module.next.date)}</p>
            <p className="text-[13px] leading-[18px] text-oa-muted-fg">
              Nothing reports before then. {module.next.ticker} is next, {pct(module.next.weight)} of {money_}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Two rows of seven on a phone, one row of fourteen from sm. */}
          <ol className={`grid grid-cols-7 gap-1 sm:grid-cols-[repeat(14,minmax(0,1fr))] ${fill ? "shrink-0" : "lg:flex-1"}`}>
            {module.days.map((slot) => {
              const weekday = new Date(`${slot.date}T00:00:00Z`).getUTCDay();
              const weekend = weekday === 0 || weekday === 6;
              return (
                <li
                  key={slot.date}
                  className={`flex min-h-[5.5rem] flex-col sm:min-h-[6.25rem] items-center gap-1 rounded-[4px] px-0.5 pb-1.5 pt-1 ${slot.tickers.length > 0 ? "bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)]" : weekend ? "opacity-50" : "bg-oa-bg"}`}
                  aria-label={`${day(slot.date)}: ${slot.tickers.length > 0 ? slot.tickers.map((t) => t.ticker).join(", ") : "nothing"}`}
                >
                  <span className="text-[10.5px] leading-3 text-oa-muted-fg">{WEEKDAY[weekday]}</span>
                  <span className={`${NUM} text-[12px] leading-4 text-oa-fg`}>{Number(slot.date.slice(8, 10))}</span>
                  {slot.tickers.slice(0, 3).map((ticker) => (
                    <Link key={ticker.ticker} href={`/stock/${encodeURIComponent(ticker.ticker)}`} prefetch={false} title={ticker.ticker}>
                      <StockLogo ticker={ticker.ticker} size={18} atOnce />
                    </Link>
                  ))}
                  {slot.tickers.length > 3 ? <span className={`${NUM} text-[10.5px] text-oa-muted-fg`}>+{slot.tickers.length - 3}</span> : null}
                </li>
              );
            })}
          </ol>
          <ul className={`${LIST} mt-3 border-t border-oa-border pt-2 ${fill ? "lg:max-h-none lg:min-h-0 lg:flex-1" : ""}`}>
            {module.days.flatMap((slot) =>
              slot.tickers.map((ticker) => (
                <li key={ticker.ticker} className="grid h-8 grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] items-center gap-2">
                  <Tick ticker={ticker.ticker} />
                  <span className={`${NUM} text-right text-[12.5px] text-oa-muted-fg`}>{day(slot.date)}</span>
                  <span className={`${NUM} text-right text-[13px] text-oa-fg`}>{pct(ticker.weight)}</span>
                </li>
              )),
            )}
          </ul>
        </>
      )}
    </ChartCard>
  );
}

const CALL_COLOR = { "Buy more": UP, Keep: FLAT, "Sell some": DOWN } as const;

/**
 * Our calls on the money: the split by call as short rows with a bar each (how much of the money each call covers),
 * then the holdings near a level, which take the rest of the card. Across the page (`wide`) the two sit side by side.
 */
function Calls({ module, showUpsell, example, className, wide }: { module: CallsModule; showUpsell: boolean; example: boolean; className: string; wide: boolean }) {
  const parts = [
    { label: "Buy more", value: module.split.buyMore, color: UP },
    { label: "Keep", value: module.split.keep, color: FLAT },
    { label: "Sell some", value: module.split.sellSome, color: DOWN },
    { label: "No call", value: module.split.none, color: "var(--oa-border)" },
  ].filter((part) => part.value > 0);
  const rows = module.rows.length > 0;
  return (
    <ChartCard title={example ? "Our calls on this mix" : "Our calls on your money"} flush className={className}>
      <div className={`flex min-h-0 flex-1 flex-col ${wide && rows ? "lg:grid lg:grid-cols-2" : ""}`}>
      <ul className="flex flex-col gap-1.5 px-4 py-3" aria-label="The money by call">
        {parts.map((part) => (
          <li key={part.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-[12.5px] leading-5">
            <Key color={part.color}>
              <span className="text-oa-fg">{part.label}</span>
            </Key>
            <span className="h-2 overflow-hidden rounded-[2px] bg-oa-bg">
              <span className="block h-full rounded-[2px]" style={{ width: `${Math.min(100, part.value)}%`, background: part.color }} />
            </span>
            <span className={`${NUM} text-right text-[13px] text-oa-fg`}>{pct(part.value)}</span>
          </li>
        ))}
      </ul>
      {rows ? (
        <ul className={`${LIST} border-t border-oa-border px-4 py-2 ${wide ? "lg:border-l lg:border-t-0" : "lg:min-h-0 lg:flex-1"}`}>
          {module.rows.map((row) => (
            <li key={row.ticker} className="grid h-8 grid-cols-[5.25rem_minmax(0,1fr)_3.75rem] items-center gap-2" title={`${row.ticker} at $${row.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}>
              <Tick ticker={row.ticker} />
              <span className="truncate text-[12.5px]" style={{ color: CALL_COLOR[row.call] }}>
                {row.call === "Buy more" ? "Buy below" : "Sell above"} <span className={NUM}>${row.level.toLocaleString("en-US", { maximumFractionDigits: row.level >= 100 ? 0 : 2 })}</span>
              </span>
              <span className={`${NUM} text-right text-[13px] text-oa-fg`} title="How far the price has to move to reach the level">
                {/* Past the level already (below a buy-more level, above a sell-some one): say so rather than print a sign to decode. */}
                {(row.call === "Buy more" ? row.distancePct >= 0 : row.distancePct <= 0) ? "reached" : signedPct(row.distancePct)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      </div>
      {showUpsell && module.withheld > 0 ? (
        <p className="mt-auto border-t border-oa-border px-4 py-2 text-[12.5px] leading-4 text-oa-muted-fg">
          Levels on {module.withheld} more {module.withheld === 1 ? "holding come" : "holdings come"} with{" "}
          <Link href="/pricing#covered_stocks" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
            Pro
          </Link>
        </p>
      ) : null}
    </ChartCard>
  );
}

function Income({ module }: { module: IncomeModule }) {
  const max = Math.max(1, ...module.months.map((month) => month.confirmed + month.estimated));
  const anyEstimate = module.months.some((month) => month.estimated > 0);
  const soft = "color-mix(in srgb, var(--oa-primary) 38%, transparent)";
  return (
    <ChartCard
      title={`Dividends, next 12 months: ${money(module.total)}`}
      className={SPAN[12]}
      aside={
        anyEstimate ? (
          <>
            <Key color={MINE}>Announced</Key>
            <Key color={soft}>Expected</Key>
          </>
        ) : undefined
      }
    >
      <div className="grid h-[120px] grid-cols-12 items-end gap-1.5 lg:h-[160px] lg:gap-4" role="img" aria-label={module.months.map((month) => `${monthName(month.month)} ${money(month.confirmed + month.estimated)}`).join(", ")}>
        {module.months.map((month) => {
          const total = month.confirmed + month.estimated;
          return (
            <span key={month.month} className="mx-auto flex h-full w-full max-w-14 flex-col justify-end" title={`${monthName(month.month)}: ${money(total)}`}>
              {total > 0 ? <span className={`${NUM} mb-0.5 text-center text-[10px] leading-3 text-oa-muted-fg`}>{total >= 1000 ? `${(total / 1000).toFixed(1)}k` : Math.round(total)}</span> : null}
              <span className="w-full rounded-t-[2px]" style={{ height: `${(month.estimated / max) * 85}%`, background: soft }} />
              <span className="w-full" style={{ height: `${(month.confirmed / max) * 85}%`, background: MINE }} />
            </span>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-12 gap-1.5 lg:gap-4">
        {module.months.map((month) => (
          <span key={month.month} className="text-center text-[10.5px] text-oa-muted-fg">
            {monthName(month.month)}
          </span>
        ))}
      </div>
      {module.largest && module.largest.share >= 25 ? (
        <p className="mt-3 text-[13px] leading-[18px] text-oa-muted-fg">
          {module.largest.ticker} pays {pct(module.largest.share)} of it
        </p>
      ) : null}
    </ChartCard>
  );
}
