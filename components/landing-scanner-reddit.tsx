"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";
import { StockLogo } from "@/components/stock-logo";

const CYAN = "#22d3ee";

type RedditPick = { ticker: string; sentiment: string; summary: string; mention_count?: number };

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function LandingScannerReddit({
  scannerItems,
  redditPicks,
}: {
  scannerItems: ScannerItem[];
  redditPicks: RedditPick[];
}) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const [scannerHeight, setScannerHeight] = useState<number>();
  const [syncHeight, setSyncHeight] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => setSyncHeight(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  useEffect(() => {
    const el = scannerRef.current;
    if (!el || !syncHeight) {
      setScannerHeight(undefined);
      return;
    }

    const sync = () => setScannerHeight(Math.round(el.getBoundingClientRect().height));
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scannerItems, syncHeight]);

  return (
    <section className="border-b border-outline-variant" style={{ background: "color-mix(in srgb, var(--surface) 40%, transparent)" }}>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div>
          <div className="mb-1 font-mono text-[12px]" style={{ color: CYAN }}>// scanner</div>
          <h2 className="mb-6 text-2xl font-extrabold text-on-surface sm:text-3xl">Today&apos;s movers, and why</h2>
          <div ref={scannerRef}>
            <MoversScanner items={scannerItems} limit={7} showCount={false} />
          </div>
        </div>

        <div>
          <div className="mb-1 font-mono text-[12px]" style={{ color: CYAN }}>// reddit buzz</div>
          <h2 className="mb-6 text-2xl font-extrabold text-on-surface sm:text-3xl">What the crowd&apos;s saying</h2>
          <div
            className="flex min-h-0 flex-col lg:overflow-hidden"
            style={syncHeight && scannerHeight != null ? { height: scannerHeight } : undefined}
          >
            {/* align card list with scanner panel (below gainers/losers tabs) */}
            <div className="mb-4 hidden h-[30px] shrink-0 lg:block" aria-hidden />
            <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-y-contain">
              {redditPicks.length > 0 ? (
                <div className="space-y-3">
                  {redditPicks.map((r) => {
                    const c = r.sentiment === "bearish" ? "var(--signal-bearish)" : r.sentiment === "bullish" ? "var(--signal-bullish)" : CYAN;
                    return (
                      <div key={r.ticker} className="panel p-4">
                        <div className="mb-1.5 flex items-center gap-2 font-mono text-[12px]">
                          <StockLogo ticker={r.ticker} market="US" size={20} />
                          <span className="font-bold text-on-surface">{r.ticker}</span>
                          {n(r.mention_count) && <span className="text-on-surface-variant">{r.mention_count} mentions</span>}
                          <span className="ml-auto rounded px-2 py-0.5 text-[10px]" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>{r.sentiment}</span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-on-surface-variant">{r.summary}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Link href="/reddit-buzz" className="panel block p-5 text-[13px] text-on-surface-variant hover:bg-surface-container">
                  See what retail is debating on r/stocks →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
