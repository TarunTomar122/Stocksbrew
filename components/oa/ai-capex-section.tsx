import type { ReactNode } from "react";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { SquircleSurface } from "@/components/oa/squircle";
import { TrackButton } from "@/components/track-button";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import type { AiCapexBeneficiary, AiCapexWatchItem } from "@/lib/ai-capex";

type MarketQuote = {
  price?: number;
  changePct?: number;
};

export type AiCapexRow = AiCapexBeneficiary & MarketQuote;
export type AiCapexWatchRow = AiCapexWatchItem & MarketQuote;

function money(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span
      className="tabular-nums"
      style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
    >
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

const ROLE_TONE: Record<AiCapexBeneficiary["role"], string> = {
  Compute: "var(--signal-bullish)",
  Memory: "var(--signal-bullish)",
  Manufacturing: "var(--primary)",
  Networking: "var(--primary)",
  "Power & cooling": "var(--signal-neutral)",
  "AI platforms": "var(--on-surface-variant)",
  Cooling: "var(--signal-neutral)",
  "Optical connectivity": "var(--primary)",
  "Grid infrastructure": "var(--signal-neutral)",
  "Reliable power": "var(--signal-neutral)",
  "Data centers": "var(--on-surface-variant)",
};

function RolePill({ role }: { role: AiCapexBeneficiary["role"] }) {
  const color = ROLE_TONE[role];
  return (
    <span
      className="inline-flex w-fit rounded-full border border-oa-border bg-oa-card px-2.5 py-1 text-[12px] font-medium"
      style={{ color }}
    >
      {role}
    </span>
  );
}

function StocksbrewView({ row }: { row: AiCapexRow }) {
  const hasScore = typeof row.stocksbrewScore === "number";
  return (
    <div className="shrink-0 text-left md:text-right">
      <p
        className="text-[16px] font-medium"
        style={{
          color: hasScore
            ? "var(--signal-bullish)"
            : "var(--on-surface-variant)",
        }}
      >
        {hasScore ? (
          <>
            {row.stocksbrewLabel}
            <span className="ml-1 tabular-nums">· {row.stocksbrewScore}</span>
          </>
        ) : (
          "—"
        )}
      </p>
    </div>
  );
}

type WatchlistProps = {
  isSubscribed?: boolean;
  trackedIds?: string[];
  trackedCount?: number;
};

function WatchlistAction({
  ticker,
  isSubscribed,
  trackedIds,
  trackedCount,
}: WatchlistProps & { ticker: string }) {
  const instrumentId = "US_" + ticker;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <TrackButton
        ticker={ticker}
        instrumentId={instrumentId}
        tier={resolveStockTier(instrumentId, trackedIds ?? [])}
        isSubscribed={isSubscribed}
        isTracked={Boolean(trackedIds?.includes(instrumentId))}
        trackedCount={trackedCount}
        variant="icon"
      />
    </span>
  );
}

function BeneficiaryRow({
  row,
  ...watchlistProps
}: { row: AiCapexRow } & WatchlistProps) {
  return (
    <div className="group border-t border-oa-border/70 px-3 py-4 first:border-t-0 sm:px-5 sm:py-5">
      <div className="grid gap-4 md:grid-cols-[minmax(10rem,0.85fr)_9rem_minmax(0,1.6fr)_8rem] md:items-start md:gap-5">
        <div className="flex min-w-0 items-start gap-2.5">
          <Link href={"/stock/" + row.ticker} className="shrink-0 outline-none">
            <StockLogo ticker={row.ticker} market="US" size={32} circle />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={"/stock/" + row.ticker}
                className="text-[17px] font-medium leading-6 text-oa-fg outline-none hover:text-oa-primary focus-visible:text-oa-primary"
              >
                {row.ticker}
              </Link>
              <WatchlistAction ticker={row.ticker} {...watchlistProps} />
            </div>
            <Link
              href={"/stock/" + row.ticker}
              className="block truncate text-[14px] leading-6 text-oa-muted-fg outline-none"
            >
              {row.company}
            </Link>
          </div>
        </div>
        <RolePill role={row.role} />
        <div className="min-w-0">
          <p className="text-[15px] leading-6 text-oa-fg">
            {row.whyItBenefits}
          </p>
        </div>
        <StocksbrewView row={row} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-0 text-[14px] text-oa-muted-fg md:hidden">
        {typeof row.price === "number" ? (
          <span className="font-medium tabular-nums text-oa-fg">
            ${money(row.price)}
          </span>
        ) : null}
        {typeof row.changePct === "number" ? pctLabel(row.changePct) : null}
      </div>
    </div>
  );
}

function WatchItem({
  row,
  ...watchlistProps
}: { row: AiCapexWatchRow } & WatchlistProps) {
  return (
    <div className="group h-full">
      <SquircleSurface className="h-full border border-oa-border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-oa-accent/60 group-focus-within:bg-oa-accent/60">
        <div className="flex items-start gap-2.5">
          <Link href={"/stock/" + row.ticker} className="shrink-0 outline-none">
            <StockLogo ticker={row.ticker} market="US" size={28} circle />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link
                href={"/stock/" + row.ticker}
                className="text-[17px] font-medium text-oa-fg outline-none hover:text-oa-primary focus-visible:text-oa-primary"
              >
                {row.ticker}
              </Link>
              <WatchlistAction ticker={row.ticker} {...watchlistProps} />
            </div>
            <Link
              href={"/stock/" + row.ticker}
              className="block truncate text-[14px] text-oa-muted-fg outline-none"
            >
              {row.company}
            </Link>
          </div>
          <div className="ml-auto text-right">
            {typeof row.price === "number" ? (
              <p className="text-[15px] font-medium tabular-nums text-oa-fg">
                ${money(row.price)}
              </p>
            ) : null}
            {typeof row.changePct === "number" ? (
              <p className="mt-0.5 text-[13px] font-medium">
                {pctLabel(row.changePct)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RolePill role={row.role} />
          {row.coverageNote ? (
            <span className="text-[12px] text-oa-muted-fg">
              {row.coverageNote}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[15px] leading-6 text-oa-muted-fg">
          {row.whyItBenefits}
        </p>
      </SquircleSurface>
    </div>
  );
}

function BeneficiaryGhost() {
  return (
    <div className="flex items-start gap-3 px-3 py-4 sm:px-5 sm:py-5">
      <div className="size-8 shrink-0 rounded-full bg-oa-secondary" />
      <div className="w-36 shrink-0 space-y-2 sm:w-44">
        <div className="h-4 w-14 rounded-full bg-oa-secondary" />
        <div className="h-3 w-24 rounded-full bg-oa-secondary" />
      </div>
      <div className="h-6 w-28 rounded-full bg-oa-secondary" />
      <div className="ml-auto space-y-2">
        <div className="ml-auto h-4 w-16 rounded-full bg-oa-secondary" />
        <div className="ml-auto h-3 w-12 rounded-full bg-oa-secondary" />
      </div>
    </div>
  );
}

function BeneficiaryGate({
  hiddenCount,
  unlockAction,
}: {
  hiddenCount: number;
  unlockAction?: ReactNode;
}) {
  return (
    <div className="relative border-t border-oa-border">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none overflow-hidden opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      >
        <BeneficiaryGhost />
        <BeneficiaryGhost />
      </div>
      <div
        role="status"
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-3 pb-4 pt-10 text-center sm:flex-row sm:justify-between sm:px-5 sm:text-left"
      >
        <p className="text-[16px] leading-7 text-oa-muted-fg">
          <span className="font-medium text-oa-fg">
            {hiddenCount} more AI capex beneficiaries.
          </span>{" "}
          Pro unlocks every company in this theme.
        </p>
        {unlockAction}
      </div>
    </div>
  );
}

export function AiCapexSection({
  rows,
  watchlist,
  isSubscribed,
  trackedIds,
  trackedCount,
  unlockAction,
}: {
  rows: AiCapexRow[];
  watchlist: AiCapexWatchRow[];
  isSubscribed: boolean;
  trackedIds?: string[];
  trackedCount?: number;
  unlockAction?: ReactNode;
}) {
  const visibleRows = isSubscribed ? rows : rows.slice(0, 4);
  const hiddenCount = rows.length - visibleRows.length;
  const watchlistProps = { isSubscribed, trackedIds, trackedCount };
  return (
    <section aria-labelledby="ai-capex-heading">
      <div className="mb-4 max-w-3xl">
        <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-oa-muted-fg">
          Theme
        </p>
        <h2
          id="ai-capex-heading"
          className="mt-1 text-2xl font-medium tracking-tight text-oa-fg"
        >
          AI capex beneficiaries
        </h2>
        <p className="mt-1 text-[16.5px] leading-7 text-oa-muted-fg">
          Ten public companies exposed to the AI buildout, from compute and
          memory to networking, power, cooling, and AI platforms.
        </p>
      </div>

      <SquircleSurface className="overflow-hidden border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {visibleRows.map((row) => (
          <BeneficiaryRow key={row.ticker} row={row} {...watchlistProps} />
        ))}
        {!isSubscribed && hiddenCount > 0 ? (
          <BeneficiaryGate
            hiddenCount={hiddenCount}
            unlockAction={unlockAction}
          />
        ) : null}
        <div className="border-t border-oa-border bg-oa-bg px-3 py-3 text-[13px] leading-5 text-oa-muted-fg sm:px-5">
          Curated research map · research only, not investment advice.
        </div>
      </SquircleSurface>

      {watchlist.length > 0 ? (
        <div className="mt-8">
          <div className="mb-4 max-w-2xl">
            <h3 className="text-xl font-medium tracking-tight text-oa-fg">
              Smaller names worth tracking
            </h3>
            <p className="mt-1 text-[16px] leading-7 text-oa-muted-fg">
              Higher-risk exposure across cooling, optics, power, and
              data-center real estate.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {watchlist.map((row) => (
              <WatchItem key={row.ticker} row={row} {...watchlistProps} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
