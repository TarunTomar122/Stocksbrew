"use client";

import Link from "next/link";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";
import { StockLogo } from "@/components/stock-logo";

type RedditPick = { ticker: string; sentiment: string; summary: string; mention_count?: number };

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function sentimentPillClass(sentiment: string) {
  if (sentiment === "bearish") return "reddit-sentiment-pill reddit-sentiment-pill--bearish";
  if (sentiment === "bullish") return "reddit-sentiment-pill reddit-sentiment-pill--bullish";
  return "reddit-sentiment-pill reddit-sentiment-pill--neutral";
}

function formatDataDate(raw?: string) {
  if (!raw?.trim()) return null;
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function SectionHeader({
  icon,
  tone,
  kicker,
  title,
}: {
  icon: string;
  tone: "scanner" | "reddit";
  kicker: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className={`landing-section-icon landing-section-icon--${tone}`}>
        <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'wght' 500" }}>
          {icon}
        </span>
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`landing-section-kicker ${tone === "reddit" ? "text-landing-reddit" : "text-landing-brand"}`}>
          {kicker}
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-on-surface sm:text-2xl">{title}</h2>
      </div>
    </div>
  );
}

export function LandingScannerReddit({
  scannerItems,
  redditPicks,
  dataAsOf,
}: {
  scannerItems: ScannerItem[];
  redditPicks: RedditPick[];
  dataAsOf?: string;
}) {
  const dataLabel = formatDataDate(dataAsOf);

  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="landing-card overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <div className="border-b border-outline-variant p-5 md:p-6 lg:border-b-0 lg:border-r">
              <SectionHeader
                icon="trending_up"
                tone="scanner"
                kicker="Scanner"
                title="Today's movers, and why"
              />
              <MoversScanner items={scannerItems} limit={7} showCount={false} embedded />
            </div>

            <div className="flex flex-col p-5 md:p-6">
              <SectionHeader
                icon="forum"
                tone="reddit"
                kicker="Reddit Buzz"
                title="What the crowd's saying"
              />
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {redditPicks.length > 0 ? (
                  redditPicks.map((r) => (
                    <Link key={r.ticker} href={`/stock/${r.ticker}`} className="landing-reddit-card">
                      <div className="mb-2 flex items-center gap-2">
                        <StockLogo ticker={r.ticker} market="US" size={24} />
                        <span className="text-[13px] font-bold text-on-surface">{r.ticker}</span>
                        {n(r.mention_count) ? (
                          <span className="text-[12px] text-on-surface-variant">{r.mention_count} mentions</span>
                        ) : null}
                        <span className={`ml-auto ${sentimentPillClass(r.sentiment)}`}>{r.sentiment}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-on-surface-variant">{r.summary}</p>
                    </Link>
                  ))
                ) : (
                  <Link
                    href="/reddit-buzz"
                    className="landing-reddit-card text-[13px] text-on-surface-variant"
                  >
                    See what retail is debating on r/stocks →
                  </Link>
                )}
              </div>
            </div>
          </div>

          <footer className="flex flex-col gap-2 border-t border-outline-variant px-5 py-4 text-[12px] text-on-surface-variant sm:flex-row sm:items-center sm:justify-between md:px-6">
            <p className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'wght' 400" }}>
                lightbulb
              </span>
              Stay informed. Daily market movers and what investors are talking about.
            </p>
            {dataLabel ? <p className="shrink-0 sm:text-right">Data as of {dataLabel}</p> : null}
          </footer>
        </div>
      </div>
    </section>
  );
}
