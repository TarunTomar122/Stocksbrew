"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { StockLogo } from "@/components/stock-logo";
import { MoversScanner, type ScannerItem } from "@/components/movers-scanner";
import { SECTOR_HREF_BY_LABEL, SECTOR_THEME, sectorPctMove } from "@/lib/landing-sector-data";

export type SectorCard = { label: string; avg: number; stocks: { ticker: string; changePct: number }[] };
export type RedditPick = {
  ticker: string;
  sentiment: string;
  summary: string;
  mention_count?: number;
  company?: string;
  price?: number;
  changePct?: number;
  volume?: number;
};
export type EarningsPick = { ticker: string; company: string; eventDate: string; time: string; epsEstimate: number | null; epsOutlook?: string; reaction?: string };

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

type Lens = "movers" | "premarket" | "reddit" | "sectors" | "earnings";

const TABS: { id: Lens; label: string; icon: string }[] = [
  { id: "movers", label: "Movers", icon: "trending_up" },
  { id: "reddit", label: "Reddit", icon: "forum" },
  { id: "sectors", label: "Sectors", icon: "dashboard" },
  { id: "earnings", label: "Earnings", icon: "event" },
];

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

function sentimentPillClass(sentiment: string) {
  if (sentiment === "bearish") return "reddit-sentiment-pill reddit-sentiment-pill--bearish";
  if (sentiment === "bullish") return "reddit-sentiment-pill reddit-sentiment-pill--bullish";
  return "reddit-sentiment-pill reddit-sentiment-pill--neutral";
}

function fmtPrice(v?: number) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: v < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtVolume(v?: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

export function PulseHub({
  items,
  reddit,
  sectors,
  earnings,
  premarketItems = [],
}: {
  items: ScannerItem[];
  reddit: RedditPick[];
  sectors: SectorCard[];
  earnings: EarningsPick[];
  premarketItems?: ScannerItem[];
}) {
  const showPremarket = premarketItems.length > 0;
  const [lens, setLens] = useState<Lens>("movers");

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
              <span className="material-symbols-outlined pulse-tab-icon" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          );
        })}
      </nav>

      {lens === "movers" && (
        <div className="pt-6">
          {items.length > 0 ? (
            <MoversScanner items={items} detailed variant="pulse" showCount />
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
          <MoversScanner items={premarketItems} detailed variant="pulse" showCount />
        </div>
      )}

      {lens === "reddit" && (
        <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          {reddit.length > 0 ? (
            reddit.map((r) => (
              <Link key={r.ticker} href={`/stock/${r.ticker}`} className="pulse-reddit-card">
                <div className="mb-2 flex items-center gap-2">
                  <StockLogo ticker={r.ticker} market="US" size={24} />
                  <span className="text-[13px] font-bold text-on-surface">{r.ticker}</span>
                  {typeof r.mention_count === "number" ? (
                    <span className="text-[11px] text-on-surface-variant">{r.mention_count} mentions</span>
                  ) : null}
                  <span className={`ml-auto ${sentimentPillClass(r.sentiment)}`}>{r.sentiment}</span>
                </div>
                {(r.company || typeof r.price === "number" || typeof r.changePct === "number") && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant">
                    {r.company ? <span className="max-w-[170px] truncate">{r.company}</span> : null}
                    {typeof r.price === "number" ? (
                      <span className="font-semibold tabular-nums text-on-surface">{fmtPrice(r.price)}</span>
                    ) : null}
                    {typeof r.changePct === "number" ? (
                      <span className="font-semibold tabular-nums" style={{ color: r.changePct >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
                        {r.changePct >= 0 ? "+" : ""}
                        {r.changePct.toFixed(2)}%
                      </span>
                    ) : null}
                    {typeof r.volume === "number" ? <span className="tabular-nums">vol {fmtVolume(r.volume)}</span> : null}
                  </div>
                )}
                <p className="line-clamp-3 text-[13px] leading-relaxed text-on-surface-variant">{r.summary}</p>
              </Link>
            ))
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
                  <Link
                    href={SECTOR_HREF_BY_LABEL[s.label] ?? "#"}
                    className="-mx-1 mb-3 flex items-center justify-between gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="sector-heat-icon">
                        <span
                          className="material-symbols-outlined text-[15px]"
                          style={{ fontVariationSettings: "'wght' 500" }}
                        >
                          {theme.icon}
                        </span>
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
                  </Link>

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
          {earnings.length > 0 ? (
            <>
              <p className="mb-4 text-[13px] text-on-surface-variant">
                Upcoming reports. Open any name for our pre-earnings read, the EPS call and the likely reaction.
              </p>
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
          ) : (
            <p className="text-[13px] text-on-surface-variant">No earnings in the window.</p>
          )}
        </div>
      )}
    </>
  );
}
