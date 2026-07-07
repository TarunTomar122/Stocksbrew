"use client";

import Link from "next/link";

import { FeedRowLockedBlur, FeedUnlockBar, FeedStickyUnlock } from "@/components/feed-row-lock-teaser";
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

function pctEl(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const up = v >= 0;
  return (
    <span style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

function InterestingCard({
  row,
  locked,
}: {
  row: InterestingStockRow;
  locked: boolean;
}) {
  const setupKey = row.setup_type || "momentum_setup";
  const setupLabel = SETUP_LABEL[setupKey] ?? setupKey.replaceAll("_", " ");

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={row.ticker} market="US" size={28} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-none text-on-surface">{row.ticker}</p>
            <p className="mt-1 truncate text-[11px] text-on-surface-variant">{row.name ?? row.ticker}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {pctEl(row.day_change_pct)}
          {!locked && typeof row.interesting_score === "number" ? (
            <p className="mt-1 font-mono text-[10px] tabular-nums text-on-surface-variant">
              score {row.interesting_score.toFixed(0)}
            </p>
          ) : null}
        </div>
      </div>

      {!locked ? (
        <span className="mt-3 inline-flex w-fit rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {setupLabel}
        </span>
      ) : null}

      {locked ? (
        <div className="mt-3">
          <FeedRowLockedBlur variant="mover" ticker={row.ticker} size="block" dense />
        </div>
      ) : (
        <>
          <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-on-surface">{row.headline}</p>
          {row.reasons?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {row.reasons.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-outline-variant bg-surface-container-low px-2 py-0.5 text-[10px] font-medium text-on-surface-variant"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </>
  );

  const shellClass =
    "group flex min-h-[148px] flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-landing-brand/25 hover:bg-surface-container-low";

  if (locked) {
    return (
      <div className={shellClass} aria-label={`${row.ticker} — Pro setup`}>
        {body}
      </div>
    );
  }

  return (
    <Link href={`/stock/${row.ticker}`} className={shellClass}>
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

  const visible =
    isSubscribed ? source : source.slice(0, FREE_INTERESTING_STOCKS_VISIBLE_LIMIT);
  const hasLocked = !isSubscribed && source.length > FREE_INTERESTING_STOCKS_VISIBLE_LIMIT;

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-1">
        <p className="text-[14px] font-semibold text-on-surface">Today&apos;s setups</p>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          Top names with favorable risk/reward, clean entry context, and a real reason to watch — not just movers.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((row, index) => (
          <InterestingCard
            key={row.instrument_id || row.ticker}
            row={row}
            locked={!isSubscribed && index >= FREE_INTERESTING_STOCKS_VISIBLE_LIMIT}
          />
        ))}
        {hasLocked
          ? source.slice(FREE_INTERESTING_STOCKS_VISIBLE_LIMIT).map((row) => (
              <InterestingCard key={`locked-${row.ticker}`} row={row} locked />
            ))
          : null}
      </div>
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
