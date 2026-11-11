import Link from "next/link";

import { FOCUS, NUM, ToneGlyph, fmtMoney } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import type { BuiltList, RankedStock } from "@/lib/best-stocks";
import { CALL_MEANING } from "@/lib/plain-copy";

/**
 * The ranked rows of a list. Each row is one link to the stock page: rank,
 * company name with its ticker, the one-sentence reason it is on the list,
 * the price, the number that ranks it with a bar, and our call in words.
 * Server-rendered from the slim RankedStock rows, so no price zone ever
 * reaches the page.
 *
 * Bars are drawn to scale from zero against the largest value shown, so a
 * list ranked lowest-first (P/E, RSI) has its shortest bar on top.
 */

const CALL_TONE = { Add: "up", Hold: "flat", Trim: "down" } as const;

function Bar({ value, max, signed }: { value: number; max: number; signed?: boolean }) {
  if (!(max > 0) || !Number.isFinite(value)) return null;
  const share = Math.min(1, Math.abs(value) / max);
  const color = signed ? (value >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)") : "var(--oa-primary)";
  return (
    <span aria-hidden="true" className="relative block h-1.5 w-full overflow-hidden rounded-full bg-oa-bg">
      {/* A sliver stays visible for a value of zero, so the row never looks empty. */}
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, share * 100)}%`, background: color, opacity: 0.85 }} />
    </span>
  );
}

function CallWords({ call }: { call: RankedStock["call"] }) {
  if (!call) return <span className="text-oa-muted-fg">No call yet</span>;
  return (
    <span className="inline-flex items-start gap-1.5">
      <ToneGlyph tone={CALL_TONE[call]} className="mt-[5px]" />
      <span>{CALL_MEANING[call]}</span>
    </span>
  );
}

export function RankedList({ built }: { built: BuiltList }) {
  const { shown, list } = built;
  const max = Math.max(0, ...shown.map((row) => Math.abs(row.value)));
  return (
    <div>
      <div
        aria-hidden="true"
        className="oa-caption hidden grid-cols-[2rem_minmax(0,1fr)_5.5rem_9.5rem_10rem] gap-x-4 border-b border-oa-border bg-oa-bg px-4 py-1.5 md:grid"
      >
        <span>#</span>
        <span>Stock and why it is here</span>
        <span className="text-right">Price</span>
        <span>{list.metric.label}</span>
        <span>Our call</span>
      </div>
      <ol>
        {shown.map((row) => (
          <li key={row.symbol} className="border-b border-oa-border last:border-b-0">
            <Link
              href={`/stock/${encodeURIComponent(row.symbol)}`}
              prefetch={false}
              className={`grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem] gap-x-3 px-4 py-3 hover:bg-oa-accent md:grid-cols-[2rem_minmax(0,1fr)_5.5rem_9.5rem_10rem] md:gap-x-4 ${FOCUS}`}
            >
              <span className={`${NUM} pt-0.5 text-[13px] text-oa-muted-fg`}>{row.rank}</span>

              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={row.symbol} size={20} />
                  <span className="min-w-0 text-pretty text-[15px] font-medium leading-5 text-oa-fg">{row.name}</span>
                  {row.name !== row.symbol ? <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{row.symbol}</span> : null}
                </span>
                {row.why ? <span className="mt-1 block text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{row.why}</span> : null}
                {/* Phones: price and call under the reason. */}
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-oa-fg md:hidden">
                  <span className={NUM}>{fmtMoney(row.price)}</span>
                  <CallWords call={row.call} />
                </span>
              </span>

              <span className={`${NUM} hidden pt-0.5 text-right text-[14px] text-oa-fg md:block`}>{fmtMoney(row.price)}</span>

              <span className="flex flex-col items-end gap-1.5 pt-0.5 md:items-stretch">
                <span className={`${NUM} text-[14px] font-medium leading-5 text-oa-fg`}>{list.metric.format(row.value)}</span>
                <Bar value={row.value} max={max} signed={list.metric.signed} />
              </span>

              <span className="hidden pt-0.5 text-[13.5px] leading-5 text-oa-fg md:block">
                <CallWords call={row.call} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
