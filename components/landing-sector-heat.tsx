"use client";

import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { resolveStockTier } from "@/lib/ai-launch-tier";

const CYAN = "#22d3ee";

export type SectorHeatCard = {
  label: string;
  avg: number;
  stocks: { ticker: string; instrumentId: string; changePct: number }[];
};

export function LandingSectorHeat({
  sectors,
  trackedIds,
  isSubscribed,
}: {
  sectors: SectorHeatCard[];
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  const trackedSet = new Set(trackedIds);

  return (
    <section className="border-b border-outline-variant">
      <div className="mx-auto max-w-7xl px-5 py-24">
        <div className="mb-1 font-mono text-[12px]" style={{ color: CYAN }}>// sector heat</div>
        <h2 className="mb-8 text-2xl font-extrabold text-on-surface sm:text-3xl">How the sectors are leaning</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sectors.map((s) => (
            <div key={s.label} className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[15px] font-semibold text-on-surface">{s.label}</span>
                <span
                  className="flex items-center gap-1.5 font-mono text-[13px] font-bold"
                  style={{ color: s.avg >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                >
                  <span className="text-[11px] leading-none">{s.avg >= 0 ? "▲" : "▼"}</span>
                  <span className="tabular-nums">{Math.abs(s.avg).toFixed(2)}%</span>
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--outline-variant)" }}>
                {s.stocks.map((x) => {
                  const u = x.changePct >= 0;
                  const isTracked = trackedSet.has(x.instrumentId);
                  const tier = resolveStockTier(x.instrumentId, trackedIds);
                  return (
                    <div
                      key={x.ticker}
                      className="group flex items-center gap-2.5 border-t py-2.5 first:border-t-0"
                      style={{ borderColor: "var(--outline-variant)" }}
                    >
                      <Link href={`/stock/${x.ticker}`} className="shrink-0 transition-opacity group-hover:opacity-80">
                        <StockLogo ticker={x.ticker} market="US" size={22} />
                      </Link>
                      <Link
                        href={`/stock/${x.ticker}`}
                        className="shrink-0 font-mono text-[13px] text-on-surface transition-opacity group-hover:opacity-80"
                      >
                        {x.ticker}
                      </Link>
                      <div className="flex min-w-0 flex-1 items-center justify-center">
                        {!isTracked && (
                          <div className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <TrackButton
                              ticker={x.ticker}
                              instrumentId={x.instrumentId}
                              tier={tier}
                              isSubscribed={isSubscribed}
                              isTracked={isTracked}
                              variant="icon"
                            />
                          </div>
                        )}
                      </div>
                      <Link
                        href={`/stock/${x.ticker}`}
                        className="flex shrink-0 items-center gap-1.5 font-mono text-[13px] transition-opacity group-hover:opacity-80"
                        style={{ color: u ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
                      >
                        <span className="text-[10px] leading-none">{u ? "▲" : "▼"}</span>
                        <span className="w-14 text-right tabular-nums">{Math.abs(x.changePct).toFixed(2)}%</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
