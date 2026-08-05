"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import Link from "next/link";
import { useState } from "react";
import { FeedLockedSection, FeedRowLockedBlur } from "@/components/feed-row-lock-teaser";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { resolveStockTier } from "@/lib/ai-launch-tier";

export type ScannerItem = {
  ticker: string;
  company?: string;
  instrument_id?: string;
  price: number;
  changePct: number;
  tag: string;
  buzz?: string;
  // move explanation (Pulse detailed view)
  headline?: string;
  whyItMatters?: string;
  confidence?: string;
};

export function MoversScanner({
  items,
  limit,
  fullItemLimit,
  showCount = true,
  detailed = false,
  embedded = false,
  variant = embedded ? "landing" : "default",
  unlockSignedOutLabel,
  trackedIds,
  isSubscribed,
  trackedCount,
  showUnlockCta = true,
  hideLockedRows = false,
  lockedPreviewCount = 0,
}: {
  items: ScannerItem[];
  limit?: number;
  fullItemLimit?: number;
  showCount?: boolean;
  detailed?: boolean;
  embedded?: boolean;
  variant?: "default" | "landing" | "pulse";
  unlockSignedOutLabel?: string;
  trackedIds?: string[];
  isSubscribed?: boolean;
  trackedCount?: number;
  showUnlockCta?: boolean;
  hideLockedRows?: boolean;
  lockedPreviewCount?: number;
}) {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const gainers = items.filter((i) => i.changePct >= 0);
  const losers = items.filter((i) => i.changePct < 0);
  const all = tab === "gainers" ? gainers : losers;
  const rows = typeof limit === "number" ? all.slice(0, limit) : all;
  const uiVariant = variant === "default" && embedded ? "landing" : variant;

  const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tabBtn = (key: "gainers" | "losers", label: string, count: number) => {
    const on = tab === key;
    const pulseLabel = key === "gainers" ? "Gainers" : "Losers";
    if (uiVariant === "landing" || uiVariant === "pulse") {
      return (
        <button
          type="button"
          onClick={() => {
            setTab(key);
          }}
          className={`landing-scanner-tab ${on ? "landing-scanner-tab-active" : "text-on-surface-variant"}`}
        >
          {key === "gainers" ? "▲" : "▼"} {uiVariant === "pulse" ? pulseLabel : label}
          {showCount ? <span className="opacity-80"> {count}</span> : null}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className="rounded-md px-3.5 py-1.5 font-mono text-[12px] transition-colors"
        style={
          on
            ? { background: "var(--surface-container-high)", color: "var(--on-surface)" }
            : { color: "var(--on-surface-variant)" }
        }
      >
        {key === "gainers" ? "▲" : "▼"} {label}{showCount ? <span className="opacity-75"> {count}</span> : null}
      </button>
    );
  };

  const listShell = uiVariant === "landing" ? "min-w-0 flex flex-col gap-1" : uiVariant === "pulse" ? "" : "panel overflow-hidden";
  const isLocked = (index: number) =>
    typeof fullItemLimit === "number" && Number.isFinite(fullItemLimit) && index >= fullItemLimit;
  const hasLockedRows =
    typeof fullItemLimit === "number" &&
    Number.isFinite(fullItemLimit) &&
    rows.some((_, index) => index >= fullItemLimit);
  const visibleRows = hasLockedRows && (hideLockedRows || showUnlockCta)
    ? [
        ...rows.filter((_, index) => !isLocked(index)),
        ...rows.filter((_, index) => isLocked(index)).slice(0, lockedPreviewCount),
      ]
    : rows;

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {tabBtn("gainers", "gainers", gainers.length)}
        {tabBtn("losers", "losers", losers.length)}
      </div>
      {rows.length === 0 ? (
        <div className={listShell}><p className="px-5 py-8 text-center font-mono text-[13px] text-on-surface-variant">no {tab} right now</p></div>
      ) : detailed ? (
        uiVariant === "pulse" ? (
          <>
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
              {visibleRows.map((a, index) => {
                const up = a.changePct >= 0;
                const locked = isLocked(index);
                const shellClass = "grid min-w-0 gap-3 border-t border-outline-variant px-4 py-4 first:border-t-0 transition-colors hover:bg-surface-container-low sm:grid-cols-[13rem_minmax(0,42rem)_minmax(6rem,1fr)] sm:items-start sm:gap-4 sm:px-5";
                const body = (
                  <>
                    <div className="flex min-w-0 items-center gap-2.5">
                        <StockLogo ticker={a.ticker} market="US" size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-bold text-on-surface">{a.ticker}</span>
                          {a.company ? (
                            <span className="block text-[12px] font-medium text-on-surface-variant">
                              {a.company}
                            </span>
                          ) : null}
                        </span>
                        <div className="shrink-0 text-right sm:hidden">
                          <p className="text-[15px] font-bold tabular-nums text-on-surface">${money(a.price)}</p>
                          <p className="mt-0.5 text-[12px] font-semibold tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                            {up ? "▲" : "▼"} {Math.abs(a.changePct).toFixed(2)}%
                          </p>
                        </div>
                    </div>
                    <div className="min-w-0">
                    {locked ? (
                      <FeedRowLockedBlur
                        variant="mover"
                        ticker={a.ticker}
                        previewLines={[a.headline || "", a.whyItMatters || a.tag || ""]}
                        size="inline"
                      />
                    ) : (
                      <>
                        {a.headline ? <p className="text-[14px] font-semibold leading-snug text-on-surface">{a.headline}</p> : null}
                        {a.whyItMatters ? <p className="mt-1 text-[13px] font-medium leading-relaxed text-on-surface-variant">{a.whyItMatters}</p> : null}
                        {!a.whyItMatters && a.tag ? <p className="mt-1 text-[13px] font-medium leading-relaxed text-on-surface-variant">{a.tag}</p> : null}
                      </>
                    )}
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-[15px] font-bold tabular-nums text-on-surface">${money(a.price)}</p>
                        <p
                          className="mt-0.5 flex items-center justify-end gap-0.5 text-[12px] font-semibold tabular-nums"
                          style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                        >
                          <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                          {Math.abs(a.changePct).toFixed(2)}%
                        </p>
                    </div>
                  </>
                );
                return locked ? (
                  <div key={a.ticker} className={shellClass}>
                    {body}
                  </div>
                ) : (
                  <Link key={a.ticker} href={`/stock/${a.ticker}`} className={shellClass}>
                    {body}
                  </Link>
                );
              })}
              {hasLockedRows && showUnlockCta ? (
                <FeedLockedSection
                  surface="market_anomalies"
                  count={rows.length - visibleRows.length}
                  noun="market moves"
                  signedOutLabel={unlockSignedOutLabel}
                />
              ) : null}
            </div>
          </>
        ) : (
        <>
          {/* top movers — explained */}
          <div className="grid gap-3 md:grid-cols-2">
            {rows.slice(0, 4).map((a) => {
              const up = a.changePct >= 0;
              return (
                <Link key={a.ticker} href={`/stock/${a.ticker}`} className="panel block p-5 transition-opacity hover:opacity-90">
                  <div className="flex items-center gap-2.5 font-mono text-[13px]">
                    <StockLogo ticker={a.ticker} market="US" size={24} />
                    <span className="font-bold text-on-surface">{a.ticker}</span>
                    {a.buzz && <span className="sentiment-pill rounded px-1.5 py-0.5 text-[10px]" style={{ color: a.buzz === "bearish" ? "var(--signal-bearish)" : a.buzz === "bullish" ? "var(--signal-bullish)" : "var(--accent-terminal)" }}>💬 {a.buzz}</span>}
                    <span className="ml-auto flex items-center gap-3">
                      <span className="whitespace-nowrap text-on-surface">${money(a.price)}</span>
                      <span className="flex items-center gap-1" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                        <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                        <span className="tabular-nums">{Math.abs(a.changePct).toFixed(2)}%</span>
                      </span>
                    </span>
                  </div>
                  {a.headline && <p className="mt-3 text-[15px] font-semibold leading-snug text-on-surface">{a.headline}</p>}
                  {a.whyItMatters && <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">{a.whyItMatters}</p>}
                  {(a.confidence === "high" || a.confidence === "low") && (
                    <p className="mt-2.5 font-mono text-[11px] uppercase tracking-wide text-on-surface-variant">
                      confidence · <span style={{ color: a.confidence === "high" ? "var(--signal-bullish)" : "var(--signal-neutral)" }}>{a.confidence}</span>
                    </p>
                  )}
                </Link>
              );
            })}
          </div>

          {/* the rest — tight headline list */}
          {rows.length > 4 && (
            <>
              <p className="mb-2 mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant">everything else moving</p>
              <div className="panel overflow-hidden">
                {rows.slice(4).map((a) => {
                  const up = a.changePct >= 0;
                  const subline = a.headline || a.tag;
                  return (
                    <Link
                      key={a.ticker}
                      href={`/stock/${a.ticker}`}
                      className="block border-t px-5 py-3 transition-colors first:border-t-0 hover:bg-surface-container hover:[box-shadow:inset_0_0_0_1px_var(--outline-variant)]"
                      style={{ borderColor: "var(--outline-variant)" }}
                    >
                      <div className="flex items-center gap-3 font-mono text-[13px]">
                        <StockLogo ticker={a.ticker} market="US" size={20} />
                        <span className="min-w-0 flex-1 font-bold text-on-surface">{a.ticker}</span>
                        <div className="shrink-0 text-right leading-tight">
                          <p className="tabular-nums text-on-surface-variant">${money(a.price)}</p>
                          <p
                            className="mt-0.5 flex items-center justify-end gap-1 text-[12px] font-semibold tabular-nums"
                            style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                          >
                            <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                            {Math.abs(a.changePct).toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      {subline ? (
                        <p className="mt-1.5 pl-8 text-[13px] leading-snug text-on-surface-variant">{subline}</p>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </>
        )
      ) : (
        <div className={listShell}>
          {visibleRows.map((a, index) => {
            const up = a.changePct >= 0;
            const locked = isLocked(index);
            if (uiVariant === "landing") {
              const instrumentId = a.instrument_id;
              const isTracked = Boolean(instrumentId && trackedIds?.includes(instrumentId));
              const stockHref = `/stock/${a.ticker}`;
              const priceBlock = (
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-bold tabular-nums text-on-surface">${money(a.price)}</p>
                  <p
                    className="mt-0.5 flex items-center justify-end gap-0.5 text-[12px] font-semibold tabular-nums"
                    style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                  >
                    <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                    {Math.abs(a.changePct).toFixed(2)}%
                  </p>
                </div>
              );
              return (
                <div
                  key={a.ticker}
                  className="group flex w-full min-w-0 items-start gap-3 rounded-lg py-3.5 transition-colors hover:bg-surface-container-low"
                >
                  {locked ? (
                    <StockLogo ticker={a.ticker} market="US" size={36} className="shrink-0" />
                  ) : (
                    <Link href={stockHref} className="shrink-0">
                      <StockLogo ticker={a.ticker} market="US" size={36} />
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {locked ? (
                        <p className="text-[14px] font-bold text-on-surface">{a.ticker}</p>
                      ) : (
                        <Link href={stockHref} className="text-[14px] font-bold text-on-surface hover:opacity-90">
                          {a.ticker}
                        </Link>
                      )}
                      {!locked && instrumentId ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <TrackButton
                            ticker={a.ticker}
                            instrumentId={instrumentId}
                            tier={resolveStockTier(instrumentId, trackedIds ?? [])}
                            isSubscribed={isSubscribed}
                            isTracked={isTracked}
                            trackedCount={trackedCount}
                            variant="icon"
                          />
                        </span>
                      ) : null}
                    </div>
                    {locked ? (
                      <FeedRowLockedBlur
                        variant="mover"
                        ticker={a.ticker}
                        previewLines={[a.headline || "", a.whyItMatters || a.tag || ""]}
                        size="inline"
                        className="mt-1"
                      />
                    ) : (
                      <Link href={stockHref} className="mt-1 block hover:opacity-90">
                        {a.headline ? (
                          <span className="block text-[13px] font-semibold leading-snug text-on-surface">
                            {a.headline}
                          </span>
                        ) : null}
                        {!a.headline && a.tag ? (
                          <span className="block text-[13px] leading-snug text-on-surface-variant">
                            {a.tag}
                          </span>
                        ) : null}
                      </Link>
                    )}
                  </div>
                  {locked ? priceBlock : (
                    <Link href={stockHref} className="shrink-0 hover:opacity-90">
                      {priceBlock}
                    </Link>
                  )}
                </div>
              );
            }
            const defaultRowBody = (
              <>
                <div className="flex items-center gap-3 font-mono text-[13px]">
                  <StockLogo ticker={a.ticker} market="US" size={24} />
                  <span className="font-bold text-on-surface">{a.ticker}</span>
                  <span className="ml-auto flex flex-col items-end leading-tight">
                    <span className="text-on-surface">${money(a.price)}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                      <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                      <span className="tabular-nums">{Math.abs(a.changePct).toFixed(2)}%</span>
                    </span>
                  </span>
                </div>
                {locked ? (
                  <FeedRowLockedBlur
                    variant="mover"
                    ticker={a.ticker}
                    previewLines={[a.headline || "", a.whyItMatters || a.tag || ""]}
                    size="inline"
                    className="mt-3"
                  />
                ) : a.tag ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-on-surface/90">{a.tag}</p>
                ) : null}
              </>
            );
            return locked ? (
              <div
                key={a.ticker}
                className="block border-t px-5 py-4 first:border-t-0"
                style={{ borderColor: "var(--outline-variant)" }}
              >
                {defaultRowBody}
              </div>
            ) : (
              <Link
                key={a.ticker}
                href={`/stock/${a.ticker}`}
                className="block border-t px-5 py-4 transition-colors first:border-t-0 hover:bg-surface-container hover:[box-shadow:inset_0_0_0_1px_var(--outline-variant)]"
                style={{ borderColor: "var(--outline-variant)" }}
              >
                {defaultRowBody}
              </Link>
            );
          })}
          {hasLockedRows && showUnlockCta ? (
            <FeedLockedSection
              surface="market_anomalies"
              count={rows.length - visibleRows.length}
              noun="market moves"
              signedOutLabel={unlockSignedOutLabel}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
