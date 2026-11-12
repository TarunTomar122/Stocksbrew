import Link from "next/link";

import type { CallsModule, EarningsModule, IncomeModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { ChartCard, DOWN, FLAT, Key, LIST, MINE, Module, NUM, Tick, UP, day, money, monthName, pct, signedPct } from "./parts";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** What reports soon, where our calls sit and what the holdings should pay: the free part about the person's own lines. */
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
  return (
    <Module id="ahead" title="Coming up, and our calls">
      {earnings ? <Earnings module={earnings} example={example} /> : null}
      {calls ? <Calls module={calls} showUpsell={showUpsell} example={example} /> : null}
      {income ? <Income module={income} /> : null}
    </Module>
  );
}

function Earnings({ module, example }: { module: EarningsModule; example: boolean }) {
  const money_ = example ? "the money" : "your money";
  return (
    <ChartCard
      title="Reports in the next two weeks"
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
          <ol className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-0.5 sm:gap-1">
            {module.days.map((slot) => {
              const weekday = new Date(`${slot.date}T00:00:00Z`).getUTCDay();
              const weekend = weekday === 0 || weekday === 6;
              return (
                <li
                  key={slot.date}
                  className={`flex min-h-[6.25rem] flex-col items-center gap-1 rounded-[4px] px-0.5 pb-1.5 pt-1 ${slot.tickers.length > 0 ? "bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)]" : weekend ? "opacity-50" : "bg-oa-bg"}`}
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
          <ul className={`${LIST} mt-3 border-t border-oa-border pt-2`}>
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

function Calls({ module, showUpsell, example }: { module: CallsModule; showUpsell: boolean; example: boolean }) {
  const parts = [
    { label: "Buy more", value: module.split.buyMore, color: UP },
    { label: "Keep", value: module.split.keep, color: FLAT },
    { label: "Sell some", value: module.split.sellSome, color: DOWN },
    { label: "No call", value: module.split.none, color: "var(--oa-border)" },
  ].filter((part) => part.value > 0);
  return (
    <ChartCard title={example ? "Our calls on this mix" : "Our calls on your money"} wide={false} flush>
      <div className="px-4 pt-3">
        <div className="flex h-3 overflow-hidden rounded-[3px]" role="img" aria-label={parts.map((part) => `${part.label} ${pct(part.value)}`).join(", ")}>
          {parts.map((part) => (
            <span key={part.label} style={{ width: `${part.value}%`, background: part.color }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-oa-muted-fg">
          {parts.map((part) => (
            <Key key={part.label} color={part.color}>
              {part.label} <span className={`${NUM} text-oa-fg`}>{pct(part.value)}</span>
            </Key>
          ))}
        </div>
      </div>
      {module.rows.length > 0 ? (
        <ul className={`${LIST} mt-2 border-t border-oa-border px-4 py-2`}>
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
      newRow
      aside={
        anyEstimate ? (
          <>
            <Key color={MINE}>Announced</Key>
            <Key color={soft}>Expected</Key>
          </>
        ) : undefined
      }
    >
      <div className="grid h-[120px] grid-cols-12 items-end gap-1.5" role="img" aria-label={module.months.map((month) => `${monthName(month.month)} ${money(month.confirmed + month.estimated)}`).join(", ")}>
        {module.months.map((month) => {
          const total = month.confirmed + month.estimated;
          return (
            <span key={month.month} className="flex h-full flex-col justify-end" title={`${monthName(month.month)}: ${money(total)}`}>
              {total > 0 ? <span className={`${NUM} mb-0.5 text-center text-[10px] leading-3 text-oa-muted-fg`}>{total >= 1000 ? `${(total / 1000).toFixed(1)}k` : Math.round(total)}</span> : null}
              <span className="w-full rounded-t-[2px]" style={{ height: `${(month.estimated / max) * 85}%`, background: soft }} />
              <span className="w-full" style={{ height: `${(month.confirmed / max) * 85}%`, background: MINE }} />
            </span>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-12 gap-1.5">
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
