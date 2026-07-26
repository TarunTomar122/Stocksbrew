"use client";

import Link from "next/link";

import { FeedRowLockedBlur, FeedStickyUnlock, FeedUnlockBar } from "@/components/feed-row-lock-teaser";
import { StockLogo } from "@/components/stock-logo";
import type { InterestingStockRow } from "@/lib/interesting-stocks";
import { FREE_INTERESTING_STOCKS_VISIBLE_LIMIT } from "@/lib/pro-features";

const SETUP_LABEL: Record<string, string> = {
  accumulate_setup: "Accumulate",
  breakout_watch: "Breakout watch",
  dip_setup: "Dip setup",
  momentum_setup: "Momentum",
  overheated: "Stretched",
};

function moveText(value?: number | null): { text: string; color: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { text: "—", color: "var(--on-surface-variant)" };
  }
  return {
    text: `${value >= 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(2)}%`,
    color: value >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)",
  };
}

function priceText(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value >= 1000
    ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `$${value.toFixed(2)}`;
}

function InterestingRow({ row, locked }: { row: InterestingStockRow; locked: boolean }) {
  const setupLabel = SETUP_LABEL[row.setup_type] ?? row.setup_type.replaceAll("_", " ");
  const move = moveText(row.day_change_pct);
  const todayFact =
    typeof row.risk_reward_ratio === "number"
      ? `${row.risk_reward_ratio.toFixed(1)}× risk/reward`
      : typeof row.session_max_move_pct === "number"
      ? `${Math.abs(row.session_max_move_pct).toFixed(1)}% session range`
      : typeof row.rsi_14 === "number"
      ? `RSI ${row.rsi_14.toFixed(0)}`
      : null;

  const body = (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={row.ticker} market="US" size={30} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-mono text-[13px] font-bold text-on-surface">{row.ticker}</p>
          <p className="truncate text-[10.5px] text-on-surface-variant">{row.name ?? row.ticker}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 lg:block">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-landing-brand">
          {setupLabel}
        </span>
        {!locked ? (
          <p className="mt-1 font-mono text-[10.5px] tabular-nums text-on-surface-variant">
            score <span className="font-semibold text-on-surface">{row.interesting_score.toFixed(0)}</span>
          </p>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3 lg:block lg:text-right">
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-on-surface-variant lg:hidden">
          Today
        </span>
        <div>
          <p className="font-mono text-[11.5px] font-semibold tabular-nums" style={{ color: move.color }}>
            {move.text}
          </p>
          {todayFact ? (
            <p className="mt-1 font-mono text-[9.5px] text-on-surface-variant">{todayFact}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-on-surface-variant lg:hidden">
          Price
        </span>
        <p className="font-mono text-[12px] font-semibold tabular-nums text-on-surface">
          {priceText(row.price)}
        </p>
      </div>

      <div className="col-span-2 min-w-0 border-t border-outline-variant/60 pt-2.5 lg:col-span-1 lg:border-0 lg:pt-0">
        {locked ? (
          <FeedRowLockedBlur variant="mover" ticker={row.ticker} size="inline" dense />
        ) : (
          <>
            <p className="line-clamp-2 text-[12.5px] font-medium leading-[1.45] text-on-surface">
              {row.headline}
            </p>
            {row.reasons?.length ? (
              <p className="mt-1 line-clamp-1 text-[10.5px] text-on-surface-variant">
                {row.reasons.slice(0, 2).join(" · ")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );

  const className =
    "group grid min-w-0 grid-cols-2 gap-3 px-4 py-4 transition-colors hover:bg-surface-container-low lg:grid-cols-[minmax(150px,0.75fr)_120px_118px_100px_minmax(280px,1.55fr)] lg:items-center lg:gap-4";

  return locked ? (
    <div className={className} aria-label={`${row.ticker} — Pro setup`}>
      {body}
    </div>
  ) : (
    <Link href={`/stock/${row.ticker}`} className={className}>
      {body}
    </Link>
  );
}

export function InterestingStocksFeed({
  rows,
  isSubscribed,
}: {
  rows: InterestingStockRow[];
  isSubscribed: boolean;
}) {
  const source = rows.slice(0, 10);
  if (source.length === 0) {
    return <p className="text-[13px] text-on-surface-variant">No tradeable setups ranked yet.</p>;
  }

  const hasLocked = !isSubscribed && source.length > FREE_INTERESTING_STOCKS_VISIBLE_LIMIT;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[14px] font-semibold text-on-surface">Today&apos;s setups</p>
        <p className="mt-1 text-[13px] text-on-surface-variant">The strongest setups on today&apos;s tape.</p>
      </div>
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        <div className="hidden grid-cols-[minmax(150px,0.75fr)_120px_118px_100px_minmax(280px,1.55fr)] gap-4 border-b border-outline-variant bg-surface-container-low px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-surface-variant lg:grid">
          <span>Stock</span>
          <span>Setup</span>
          <span className="text-right">Today</span>
          <span className="text-right">Price</span>
          <span>Why it is interesting</span>
        </div>
        <div className="divide-y divide-outline-variant/60">
          {source.map((row, index) => (
            <InterestingRow
              key={row.instrument_id || row.ticker}
              row={row}
              locked={!isSubscribed && index >= FREE_INTERESTING_STOCKS_VISIBLE_LIMIT}
            />
          ))}
        </div>
      </section>
      {hasLocked ? (
        <>
          <FeedUnlockBar
            surface="interesting_stocks"
            className="rounded-xl border border-outline-variant bg-surface"
            compact
            signedOutLabel="Sign in free"
            signedInLabel="Unlock all 10 setups"
          />
          <FeedStickyUnlock
            surface="interesting_stocks"
            signedOutLabel="Sign in free"
            signedInLabel="Unlock all 10 setups"
          />
        </>
      ) : null}
    </div>
  );
}
