"use client";

import Link from "next/link";
import { useState } from "react";
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

const CYAN = "#22d3ee";

export function MoversScanner({ items, limit, showCount = true, detailed = false }: { items: ScannerItem[]; limit?: number; showCount?: boolean; detailed?: boolean }) {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const gainers = items.filter((i) => i.changePct >= 0);
  const losers = items.filter((i) => i.changePct < 0);
  const all = tab === "gainers" ? gainers : losers;
  const rows = typeof limit === "number" ? all.slice(0, limit) : all;

  const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tabBtn = (key: "gainers" | "losers", label: string, count: number) => {
    const on = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        className="rounded-md px-3 py-1.5 font-mono text-[12px] transition-colors"
        style={on ? { background: "var(--surface-container-high)", color: "var(--on-surface)" } : { color: "var(--on-surface-variant)" }}
      >
        {key === "gainers" ? "▲" : "▼"} {label}{showCount ? <span className="opacity-60"> {count}</span> : null}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-4 flex gap-1.5">
        {tabBtn("gainers", "gainers", gainers.length)}
        {tabBtn("losers", "losers", losers.length)}
      </div>
      {rows.length === 0 ? (
        <div className="panel"><p className="px-5 py-8 text-center font-mono text-[13px] text-on-surface-variant">no {tab} right now</p></div>
      ) : detailed ? (
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
                    {a.buzz && <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ color: a.buzz === "bearish" ? "var(--signal-bearish)" : a.buzz === "bullish" ? "var(--signal-bullish)" : CYAN, background: "color-mix(in srgb, var(--on-surface) 6%, transparent)" }}>💬 {a.buzz}</span>}
                    <span className="ml-auto flex items-center gap-3">
                      <span className="whitespace-nowrap text-on-surface-variant">${money(a.price)}</span>
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
                  return (
                    <Link key={a.ticker} href={`/stock/${a.ticker}`} className="flex items-center gap-3 border-t px-5 py-3 font-mono text-[13px] transition-colors first:border-t-0 hover:bg-surface-container" style={{ borderColor: "var(--outline-variant)" }}>
                      <StockLogo ticker={a.ticker} market="US" size={20} />
                      <span className="w-14 font-bold text-on-surface">{a.ticker}</span>
                      <span className="flex-1 truncate text-on-surface-variant">{a.headline || a.tag}</span>
                      <span className="whitespace-nowrap text-on-surface-variant">${money(a.price)}</span>
                      <span className="flex w-20 items-center justify-end gap-1" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                        <span className="text-[10px] leading-none">{up ? "▲" : "▼"}</span>
                        <span className="tabular-nums">{Math.abs(a.changePct).toFixed(2)}%</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="panel overflow-hidden">
          {rows.map((a) => {
            const up = a.changePct >= 0;
            return (
              <Link key={a.ticker} href={`/stock/${a.ticker}`} className="block border-t px-5 py-4 transition-colors first:border-t-0 hover:bg-surface-container" style={{ borderColor: "var(--outline-variant)" }}>
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
                {a.tag && <p className="mt-3 text-[13px] leading-relaxed text-on-surface-variant">{a.tag}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
