"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";
import { AnimatedIcon } from "@/components/animated-icon";
import { InterestingStocksFeed } from "@/components/interesting-stocks-feed";
import { RedditBuzzFeed, redditPickToTicker } from "@/components/reddit-buzz-feed";
import { StockLogo } from "@/components/stock-logo";
import { SECTOR_THEME, sectorPctMove } from "@/lib/landing-sector-data";
import type { InterestingStockRow } from "@/lib/interesting-stocks";

export type SectorCard = { label: string; avg: number; stocks: { ticker: string; changePct: number }[] };
export type RedditPick = {
  ticker: string;
  sentiment: string;
  summary: string;
  mention_count?: number;
  catalysts?: string[];
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
};
export type EarningsPick = { ticker: string; company: string; eventDate: string; time: string; epsEstimate: number | null; epsOutlook?: string; reaction?: string };
export type RecentEarningsPick = {
  ticker: string;
  company: string;
  eventDate: string;
  headline: string;
  epsTag?: string;
};

const EPS_LABEL: Record<string, string> = { beat: "EPS beat", inline: "EPS inline", miss: "EPS miss", unclear: "EPS unclear" };
const MOVE_LABEL: Record<string, string> = { rally: "bullish", fade: "bearish", chop: "neutral", unclear: "unclear" };
const epsColor = (o?: string) => (o === "beat" ? "var(--signal-bullish)" : o === "miss" ? "var(--signal-bearish)" : o === "inline" ? "var(--accent-terminal)" : "var(--on-surface-variant)");
export type PulseTopline = {
  gainers: number;
  losers: number;
  lead?: { label: string; avg: number } | null;
  lag?: { label: string; avg: number } | null;
  crowd?: string | null;
};

type Lens = "movers" | "premarket" | "interesting" | "reddit" | "sectors" | "earnings";

const TABS: { id: Lens; label: string; icon: string }[] = [
  { id: "movers", label: "Movers", icon: "trending_up" },
  { id: "reddit", label: "Reddit", icon: "forum" },
  { id: "sectors", label: "Sectors", icon: "grid_view" },
  { id: "earnings", label: "Earnings", icon: "calendar_today" },
  { id: "interesting", label: "Interesting", icon: "stars" },
];

function PulseTabIcon({ name }: { name: string }) {
  return (
    <AnimatedIcon name={name} size={18} className="pulse-tab-icon" aria-hidden />
  );
}

const TIME_LABEL: Record<string, string> = { bmo: "before open", amc: "after close", during: "intraday" };
function fmtDate(d: string) {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pctEl(v: number) {
  const up = v >= 0;
  return (
    <span style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

export function PulseHub({
  items,
  reddit,
  sectors,
  earnings,
  recentEarnings,
  premarketItems = [],
  interestingStocks = [],
  fullItemLimit,
  isSubscribed = false,
}: {
  items: ScannerItem[];
  reddit: RedditPick[];
  sectors: SectorCard[];
  earnings: EarningsPick[];
  recentEarnings: RecentEarningsPick[];
  premarketItems?: ScannerItem[];
  interestingStocks?: InterestingStockRow[];
  fullItemLimit?: number;
  isSubscribed?: boolean;
}) {
  const showPremarket = premarketItems.length > 0;
  const [lens, setLens] = useState<Lens>(() => (premarketItems.length > 0 ? "premarket" : "movers"));

  useEffect(() => {
    if (lens === "premarket" && !showPremarket) setLens("movers");
  }, [lens, showPremarket]);

  const tabs = showPremarket
    ? [
        TABS[0],
        { id: "premarket" as const, label: "Pre-market", icon: "wb_twilight" },
        ...TABS.slice(1),
      ]
    : TABS;

  return (
    <>
      <nav className="pulse-tabs" aria-label="Pulse views">
        {tabs.map((t) => {
          const on = lens === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setLens(t.id)}
              className={`pulse-tab ${on ? "pulse-tab-active" : ""}`}
            >
              <PulseTabIcon name={t.icon} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {lens === "movers" && (
        <div className="pt-6">
          {items.length > 0 ? (
            <MoversScanner items={items} detailed variant="pulse" showCount fullItemLimit={fullItemLimit} />
          ) : (
            <p className="text-[13px] text-on-surface-variant">No standout moves right now.</p>
          )}
        </div>
      )}

      {lens === "premarket" && showPremarket && (
        <div className="pt-6">
          <p className="mb-4 text-[13px] text-on-surface-variant">
            Gaps vs yesterday&apos;s close before the bell.{" "}
            <Link href="/premarket" className="font-semibold text-landing-brand hover:underline">
              Full pre-market board →
            </Link>
          </p>
          <MoversScanner items={premarketItems} detailed variant="pulse" showCount fullItemLimit={fullItemLimit} />
        </div>
      )}

      {lens === "interesting" && (
        <div className="pt-6">
          <InterestingStocksFeed rows={interestingStocks} isSubscribed={isSubscribed} />
        </div>
      )}

      {lens === "reddit" && (
        <div className="pt-6">
          {reddit.length > 0 ? (
            <RedditBuzzFeed
              items={reddit.map(redditPickToTicker)}
              isSubscribed={isSubscribed}
              variant="pulse"
              gridCols="3"
            />
          ) : (
            <p className="text-[13px] text-on-surface-variant">No buzz scanned yet.</p>
          )}
        </div>
      )}

      {lens === "sectors" && (
        <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {sectors.map((s) => {
            const theme = SECTOR_THEME[s.label] ?? { accent: "var(--landing-brand)", icon: "insights" };
            const sectorMove = sectorPctMove(s.avg);

            return (
              <div
                key={s.label}
                className="sector-heat-card"
                style={{ "--sector-accent": theme.accent } as CSSProperties}
              >
                <div className="relative z-[1] flex flex-col p-4 pb-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="sector-heat-icon">
                        <AnimatedIcon name={theme.icon} size={15} className="sector-heat-icon-glyph" aria-hidden />
                      </span>
                      <span className="truncate text-[15px] font-bold text-on-surface">{s.label}</span>
                    </div>
                    <span
                      className="flex shrink-0 items-center gap-1 text-[13px] font-bold tabular-nums"
                      style={{ color: sectorMove.color }}
                    >
                      <span className="text-[10px] leading-none">{sectorMove.up ? "▲" : "▼"}</span>
                      {Math.abs(s.avg).toFixed(2)}%
                    </span>
                  </div>

                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-on-surface-variant">
                    Top stocks
                  </p>
                  <div className="mb-1 mt-2 border-t border-outline-variant" />

                  <div className="space-y-0">
                    {s.stocks.map((x) => (
                      <Link
                        key={x.ticker}
                        href={`/stock/${x.ticker}`}
                        className="flex items-center gap-2 border-t border-outline-variant py-2 first:border-t-0 transition-colors hover:bg-surface-container-low"
                      >
                        <StockLogo ticker={x.ticker} market="US" size={20} />
                        <span className="text-[13px] font-semibold text-on-surface">{x.ticker}</span>
                        <span className="ml-auto text-[12px] font-semibold tabular-nums">{pctEl(x.changePct)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lens === "earnings" && (
        <div className="pt-6">
          {earnings.length === 0 && recentEarnings.length === 0 ? (
            <p className="text-[13px] text-on-surface-variant">No earnings in the window.</p>
          ) : (
            <>
              {earnings.length > 0 ? (
                <>
                  <div className="mb-4">
                    <p className="text-[14px] font-semibold text-on-surface">Upcoming reports</p>
                    <p className="mt-1 text-[13px] text-on-surface-variant">
                      Open any name for our pre-earnings read, the EPS call and the likely reaction.
                    </p>
                  </div>
                  <div className="pulse-list-panel">
                    {earnings.map((e) => (
                      <Link
                        key={`${e.ticker}-${e.eventDate}`}
                        href={`/stock/${e.ticker}`}
                        className="pulse-list-row flex-wrap sm:flex-nowrap"
                      >
                        <StockLogo ticker={e.ticker} market="US" size={24} />
                        <span className="w-14 shrink-0 font-bold text-on-surface">{e.ticker}</span>
                        <span className="hidden min-w-0 flex-1 truncate text-on-surface-variant sm:block">{e.company}</span>
                        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          {e.epsOutlook ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ color: epsColor(e.epsOutlook), background: `color-mix(in srgb, ${epsColor(e.epsOutlook)} 14%, var(--surface))` }}
                            >
                              {EPS_LABEL[e.epsOutlook] ?? e.epsOutlook}
                              {e.reaction ? ` · ${MOVE_LABEL[e.reaction] ?? e.reaction}` : ""}
                            </span>
                          ) : null}
                          {typeof e.epsEstimate === "number" ? (
                            <span className="hidden text-[11px] text-on-surface-variant md:inline">
                              est <span className="font-semibold text-on-surface">${e.epsEstimate.toFixed(2)}</span>
                            </span>
                          ) : null}
                          <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] text-on-surface-variant">
                            {fmtDate(e.eventDate)} · {TIME_LABEL[e.time] ?? e.time}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}

              {recentEarnings.length > 0 ? (
                <div className={earnings.length > 0 ? "mt-10" : undefined}>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold text-on-surface">Recent reports</p>
                      <p className="mt-1 text-[13px] text-on-surface-variant">
                        Post-earnings reads from the last two weeks.
                      </p>
                    </div>
                    <Link
                      href="/earnings-intel"
                      className="shrink-0 font-mono text-[11px] font-semibold text-landing-brand hover:underline"
                    >
                      all reports →
                    </Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentEarnings.map((e) => (
                      <Link
                        key={`${e.ticker}-${e.eventDate}`}
                        href={`/earnings-intel/${encodeURIComponent(e.ticker)}`}
                        className="group flex min-h-[132px] flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-landing-brand/25 hover:bg-surface-container-low"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <StockLogo ticker={e.ticker} market="US" size={28} className="shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[14px] font-bold leading-none text-on-surface">{e.ticker}</p>
                              <p className="mt-1 truncate text-[11px] text-on-surface-variant">{e.company}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 font-mono text-[10px] tabular-nums text-on-surface-variant">
                            {fmtDate(e.eventDate)}
                          </span>
                        </div>

                        {e.epsTag ? (
                          <span
                            className="mt-3 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: epsColor(e.epsTag), background: `color-mix(in srgb, ${epsColor(e.epsTag)} 14%, var(--surface))` }}
                          >
                            {EPS_LABEL[e.epsTag] ?? e.epsTag}
                          </span>
                        ) : null}

                        <p className={`line-clamp-2 flex-1 text-[13px] leading-snug text-on-surface ${e.epsTag ? "mt-2" : "mt-3"}`}>
                          {e.headline}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </>
  );
}
