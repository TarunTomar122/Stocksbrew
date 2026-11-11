import Link from "next/link";

import { longDay, plainPct } from "@/components/backtest/format";
import { Panel } from "@/components/backtest/results";
import { StockLogo } from "@/components/stock-logo";
import type { StrategyRebalance } from "@/lib/strategies-rebalances";

/**
 * The latest rebalance on a strategy page: what came in, what left and why, in
 * the rule's own words. The names are today's basket, so they follow the same
 * gate as the basket (strategy_holdings): a plan that cannot see the basket
 * gets the counts and the rule, and no names are rendered.
 */
export function LatestRebalancePanel({ record, seesNames }: { record: StrategyRebalance; seesNames: boolean }) {
  const stocks = record.kind === "stocks";
  const reweighted = record.kept.filter((item) => Math.abs(item.weight - item.previous_weight) >= 0.001);
  const rows = [
    ...record.added.map((item) => ({ side: "in" as const, symbol: item.symbol, name: item.name, weight: item.weight, reason: item.reason })),
    ...record.removed.map((item) => ({ side: "out" as const, symbol: item.symbol, name: item.name, weight: item.previous_weight, reason: item.reason })),
  ];
  return (
    <Panel id="rebalance" title="Latest rebalance" aside={longDay(record.date)}>
      <div className="px-3.5 py-3">
        <p className="text-[15px] font-semibold leading-[22px] text-oa-fg">{record.headline}</p>
        <p className="mt-1 max-w-[75ch] text-pretty text-[13.5px] leading-[1.55] text-oa-fg">{seesNames || !record.market_ok ? record.why : record.rule}</p>
        {/* No second lock line here: the basket card above already says the names are part of Pro. */}
      </div>
      {seesNames && rows.length > 0 ? (
        <ul className="max-h-[27rem] divide-y divide-oa-border overflow-y-auto border-t border-oa-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows.map((row) => (
            <li
              key={`${row.side}-${row.symbol}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3.5 py-2 hover:bg-oa-accent sm:grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] sm:items-baseline"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-oa-fg">
                <span className={`w-7 text-[12.5px] font-semibold ${row.side === "in" ? "text-signal-bullish" : "text-signal-bearish"}`}>
                  {row.side === "in" ? "In" : "Out"}
                </span>
                {stocks ? (
                  <Link href={`/stock/${row.symbol}`} title={row.name ?? undefined} className="oa-mono inline-flex items-center gap-1.5 hover:text-oa-primary">
                    <StockLogo ticker={row.symbol} size={18} />
                    {row.symbol}
                  </Link>
                ) : (
                  <span title={row.name ?? undefined} className="oa-mono inline-flex items-center gap-1.5">
                    <StockLogo ticker={row.symbol} size={18} />
                    {row.symbol}
                  </span>
                )}
              </span>
              <span className="oa-mono text-right text-[13.5px] tabular-nums text-oa-fg sm:order-3">
                {row.side === "in" ? plainPct(row.weight) : <span className="text-oa-muted-fg">was {plainPct(row.weight)}</span>}
              </span>
              <span className="col-span-2 text-[13px] leading-[1.5] text-oa-muted-fg sm:order-2 sm:col-span-1">{row.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {seesNames && reweighted.length > 0 ? (
        <p className="border-t border-oa-border px-3.5 py-2 text-[13px] leading-5 text-oa-muted-fg">
          New weights for {reweighted.length} that stayed:{" "}
          {reweighted
            .slice(0, 8)
            .map((item) => `${item.symbol} ${plainPct(item.previous_weight)} to ${plainPct(item.weight)}`)
            .join(", ")}
          {reweighted.length > 8 ? `, and ${reweighted.length - 8} more` : ""}.
        </p>
      ) : null}
      <p className="border-t border-oa-border px-3.5 py-2 text-[12px] leading-5 text-oa-muted-fg">
        Picks made at the close on {longDay(record.signal_date)}
        {record.trade_date ? `, filled on ${longDay(record.trade_date)}` : ""}. Source: {record.source}.
      </p>
    </Panel>
  );
}

/** Next to the follow state for a Free account that follows a strategy: the note is what Pro adds. */
export function RebalanceNoteLock({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[12.5px] leading-5 text-oa-muted-fg ${className}`}>
      <Link prefetch={false} href="/pricing" className="font-medium text-oa-primary hover:underline">
        Pro
      </Link>{" "}
      sends you a note when it rebalances.
    </span>
  );
}
