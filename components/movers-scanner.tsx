"use client";

import Link from "next/link";
import { useState } from "react";
import { FeedRowLockedBlur, FeedUnlockBar } from "@/components/feed-row-lock-teaser";
import { StockLogo } from "@/components/stock-logo";

export type ScannerItem = {
  ticker: string;
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
}: {
  items: ScannerItem[];
  limit?: number;
  fullItemLimit?: number;
  showCount?: boolean;
  detailed?: boolean;
  embedded?: boolean;
  variant?: "default" | "landing" | "pulse";
  unlockSignedOutLabel?: string;
}) {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const [expanded, setExpanded] = useState(false);
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
            setExpanded(false);
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

  const listShell = uiVariant === "landing" ? "overflow-hidden" : uiVariant === "pulse" ? "" : "panel overflow-hidden";
  const isLocked = (index: number) =>
    typeof fullItemLimit === "number" && Number.isFinite(fullItemLimit) && index >= fullItemLimit;
  const hasLockedRows =
    typeof fullItemLimit === "number" &&
    Number.isFinite(fullItemLimit) &&
    rows.some((_, index) => index >= fullItemLimit);

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
            <div className="grid gap-4 md:grid-cols-2">
              {rows.slice(0, 4).map((a, index) => {
                const up = a.changePct >= 0;
                const locked = isLocked(index);
                const shellClass = "pulse-mover-card";
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <StockLogo ticker={a.ticker} market="US" size={28} />
                        <span className="text-[15px] font-bold text-on-surface">{a.ticker}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-bold tabular-nums text-on-surface">${money(a.price)}</p>
                        <p
                          className="mt-0.5 flex items-center justify-end gap-0.5 text-[12px] font-semibold tabular-nums"
                          style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                        >
                          <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                          {Math.abs(a.changePct).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    {locked ? (
                      <FeedRowLockedBlur variant="mover" ticker={a.ticker} size="block" className="mt-3" />
                    ) : a.headline ? (
                      <p className="mt-3 text-[15px] font-semibold leading-snug text-on-surface">{a.headline}</p>
                    ) : null}
                    {!locked && (a.whyItMatters || a.tag) ? (
                      <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-on-surface-variant">
                        {a.whyItMatters || a.tag}
                      </p>
                    ) : null}
                    {!locked && a.confidence === "high" ? (
                      <p className="pulse-confidence">Confidence high</p>
                    ) : !locked && a.confidence === "low" ? (
                      <p className="pulse-confidence" style={{ color: "var(--signal-neutral)" }}>
                        Confidence low
                      </p>
                    ) : null}
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
            </div>

            {rows.length > 4 ? (
              <>
                <p className="mb-2 mt-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
                  Everything else moving
                </p>
                <div className="pulse-list-panel">
                  {(expanded ? rows.slice(4) : rows.slice(4, 10)).map((a, offset) => {
                    const index = offset + 4;
                    const up = a.changePct >= 0;
                    const locked = isLocked(index);
                    const subline = a.headline || a.tag;
                    const rowBody = (
                      <>
                        <div className="flex items-center gap-3">
                          <StockLogo ticker={a.ticker} market="US" size={22} />
                          <span className="min-w-0 flex-1 font-semibold text-on-surface">{a.ticker}</span>
                          <div className="shrink-0 text-right leading-tight">
                            <p className="tabular-nums text-[13px] font-medium text-on-surface">${money(a.price)}</p>
                            <p
                              className="mt-0.5 flex items-center justify-end gap-0.5 text-[12px] font-semibold tabular-nums"
                              style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                            >
                              <span className="text-[9px] leading-none">{up ? "▲" : "▼"}</span>
                              {Math.abs(a.changePct).toFixed(2)}%
                            </p>
                          </div>
                        </div>
                        {locked ? (
                          <FeedRowLockedBlur variant="mover" ticker={a.ticker} size="inline" />
                        ) : subline ? (
                          <p className="text-[13px] leading-snug text-on-surface-variant">{subline}</p>
                        ) : null}
                      </>
                    );
                    return locked ? (
                      <div key={a.ticker} className="pulse-list-row pulse-list-row-stacked">
                        {rowBody}
                      </div>
                    ) : (
                      <Link key={a.ticker} href={`/stock/${a.ticker}`} className="pulse-list-row pulse-list-row-stacked">
                        {rowBody}
                      </Link>
                    );
                  })}
                  {!expanded && rows.length > 10 ? (
                    <button type="button" onClick={() => setExpanded(true)} className="pulse-view-more">
                      View more movers
                      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 500" }}>
                        expand_more
                      </span>
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
            {hasLockedRows ? (
              <FeedUnlockBar
                surface="market_anomalies"
                className="mt-4 rounded-xl border border-outline-variant"
                signedOutLabel={unlockSignedOutLabel}
              />
            ) : null}
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
          {rows.map((a, index) => {
            const up = a.changePct >= 0;
            const locked = isLocked(index);
            if (uiVariant === "landing") {
              const rowBody = (
                <>
                  <StockLogo ticker={a.ticker} market="US" size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-on-surface">{a.ticker}</p>
                    {locked ? (
                      <FeedRowLockedBlur variant="mover" ticker={a.ticker} size="inline" className="mt-1" />
                    ) : a.tag ? (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-on-surface-variant">{a.tag}</p>
                    ) : null}
                  </div>
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
                </>
              );
              return locked ? (
                <div
                  key={a.ticker}
                  className="flex items-start gap-3 border-t border-outline-variant py-4 first:border-t-0"
                >
                  {rowBody}
                </div>
              ) : (
                <Link
                  key={a.ticker}
                  href={`/stock/${a.ticker}`}
                  className="flex items-start gap-3 border-t border-outline-variant py-4 transition-colors first:border-t-0 hover:bg-surface-container-low"
                >
                  {rowBody}
                </Link>
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
                  <FeedRowLockedBlur variant="mover" ticker={a.ticker} size="inline" className="mt-3" />
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
          {hasLockedRows ? (
            <FeedUnlockBar
              surface="market_anomalies"
              compact
              className={uiVariant === "landing" ? "" : "border-outline-variant"}
              signedOutLabel={unlockSignedOutLabel}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
