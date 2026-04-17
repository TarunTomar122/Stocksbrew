/**
 * Server-rendered dashboard cards — visualisation-first.
 * Tooltips use CSS group-hover (no JS needed).
 */

import Link from "next/link";

import type {
  GlobalCue,
  MarketIndex,
  MarketOverview,
  PortfolioBriefData,
  Sector,
  Stock,
} from "@/lib/api-types";

import {
  DashboardCard,
  ToneChip,
  formatCurrency,
  formatPct,
  formatPctCompact,
  pctClass,
  sparkColor,
} from "./primitives";
import { Sparkline } from "./sparkline";

/* ══════════════════════════════════════════════════
   WATCHLIST GRID  — sparkline + 52W bar + streak + sentiment badges
   ══════════════════════════════════════════════════ */
export function WatchlistGrid({ stocks, market }: { stocks: Stock[]; market: "us" | "india" }) {
  if (stocks.length === 0) {
    return (
      <DashboardCard title="Your watchlist" eyebrow="Stocks you track">
        <div className="py-10 text-center text-[13px] text-[#8C94A8]">No stocks yet.</div>
      </DashboardCard>
    );
  }
  return (
    <DashboardCard title="Your watchlist" eyebrow={`${stocks.length} stocks`} padding="none">
      <div className="grid grid-cols-2 gap-px bg-[#1F2738] sm:grid-cols-3 lg:grid-cols-4">
        {stocks.map((s) => <WatchlistTile key={s.symbol} stock={s} market={market} />)}
      </div>
    </DashboardCard>
  );
}

function WatchlistTile({ stock, market }: { stock: Stock; market: "us" | "india" }) {
  const closes =
    stock.recentCloses && stock.recentCloses.length >= 2
      ? stock.recentCloses
      : [stock.price.previousClose, stock.price.open || stock.price.previousClose, stock.price.current];
  const tone = sparkColor(stock.price.changePct);
  const lo = stock.technicals.fiftyTwoWeekLow;
  const hi = stock.technicals.fiftyTwoWeekHigh;
  const positionPct = hi > lo ? Math.min(100, Math.max(0, ((stock.price.current - lo) / (hi - lo)) * 100)) : 50;

  const streak = stock.streak;
  const hasStreak = streak?.days >= 3 && streak.direction !== "flat";
  const sentTrend = stock.sentiment?.trend;

  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.symbol)}?market=${market}`}
      className="group flex flex-col gap-2 bg-[#141A26] p-4 transition-colors hover:bg-[#1A2130]"
    >
      {/* top row: symbol + change% */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[12px] font-semibold text-[#F5F6F8]">{stock.symbol}</span>
        <div className="flex items-center gap-1.5">
          {/* streak badge */}
          {hasStreak && (
            <span className={`rounded-[3px] px-1 py-0.5 text-[9px] font-bold tabular-nums ${
              streak.direction === "up"
                ? "bg-[rgba(34,197,94,0.15)] text-[#22C55E]"
                : "bg-[rgba(239,68,68,0.15)] text-[#EF4444]"
            }`}>
              {streak.direction === "up" ? "↑" : "↓"}{streak.days}d
            </span>
          )}
          {/* sentiment trend dot */}
          {sentTrend && sentTrend !== "stable" && (
            <span className={`h-1.5 w-1.5 rounded-full ${
              sentTrend === "improving" ? "bg-[#22C55E]" : "bg-[#EF4444]"
            }`} title={`Sentiment ${sentTrend}`} />
          )}
          <span className={`font-mono text-[11px] font-semibold tabular-nums ${pctClass(stock.price.changePct)}`}>
            {formatPctCompact(stock.price.changePct)}
          </span>
        </div>
      </div>

      {/* sparkline */}
      <div className="h-9">
        <Sparkline values={closes} tone={tone} height={36} strokeWidth={1.8} />
      </div>

      {/* price */}
      <span className="font-mono text-[13px] font-medium tabular-nums text-[#F5F6F8]">
        {formatCurrency(stock.price.current, stock.currency)}
      </span>

      {/* 52W track */}
      <div className="mt-0.5">
        <div className="relative h-0.5 rounded-full bg-[#252E42]">
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${
              tone === "green" ? "bg-[#22C55E]" : tone === "red" ? "bg-[#EF4444]" : "bg-[#8C94A8]"
            }`}
            style={{ width: `${positionPct}%` }}
          />
          <div
            className="absolute -top-0.5 h-1.5 w-0.5 rounded-full bg-[#F5F6F8]"
            style={{ left: `calc(${positionPct}% - 1px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8px] tabular-nums text-[#555E75]">
          <span>{formatCurrency(lo, stock.currency)}</span>
          <span>52W</span>
          <span>{formatCurrency(hi, stock.currency)}</span>
        </div>
      </div>
    </Link>
  );
}

/* ══════════════════════════════════════════════════
   SECTOR HEATMAP
   ══════════════════════════════════════════════════ */
export function SectorsCard({ sectors, market }: { sectors: Sector[]; market: "us" | "india" }) {
  if (sectors.length === 0) {
    return (
      <DashboardCard title="Sectors" eyebrow="Your coverage">
        <div className="py-6 text-center text-[12px] text-[#8C94A8]">No sectors tracked.</div>
      </DashboardCard>
    );
  }
  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.performance.changePct)), 0.01);
  return (
    <DashboardCard title="Sector heatmap" eyebrow={`${market === "us" ? "US" : "India"} · ${sectors.length} sectors`} padding="none">
      <div className="grid grid-cols-2 gap-px bg-[#1F2738]">
        {[...sectors].sort((a, b) => b.performance.changePct - a.performance.changePct).map((sector) => {
          const pct = sector.performance.changePct;
          const intensity = Math.abs(pct) / maxAbs;
          const isUp = pct >= 0;
          const bg = isUp ? `rgba(34,197,94,${0.05 + intensity * 0.22})` : `rgba(239,68,68,${0.05 + intensity * 0.22})`;
          const textColor = isUp ? "#22C55E" : "#EF4444";
          return (
            <Link key={sector.id} href={`/sector/${sector.id}`}
              className="flex flex-col gap-1.5 p-4 transition-opacity hover:opacity-80"
              style={{ background: bg }}
            >
              <span className="truncate text-[11px] font-medium text-[#F5F6F8]">{sector.name}</span>
              <span className="font-mono text-[16px] font-bold tabular-nums" style={{ color: textColor }}>
                {formatPct(pct)}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-[#F5F6F8]/45">{sector.sentiment.label}</span>
            </Link>
          );
        })}
      </div>
    </DashboardCard>
  );
}

/* ══════════════════════════════════════════════════
   MACRO STRIP  — server passthrough to client component
   ══════════════════════════════════════════════════ */
export { MacroStripCard } from "./macro-strip-client";

/* ══════════════════════════════════════════════════
   MARKET OVERVIEW CARD  — gauge + sentiment drivers
   ══════════════════════════════════════════════════ */
export function MarketOverviewCard({ view }: { view: MarketOverview }) {
  const sentiment = view.sentiment.overall;
  const clamped = Math.max(-1, Math.min(1, sentiment));
  const arcDeg = 90 + clamped * 90;
  const arcLabel = view.sentiment.label || (clamped > 0.2 ? "Bullish" : clamped < -0.2 ? "Bearish" : "Neutral");
  const arcColor = clamped > 0.2 ? "#22C55E" : clamped < -0.2 ? "#EF4444" : "#D4AF37";
  const toRad = (d: number) => (d * Math.PI) / 180;
  const cx = 80; const cy = 70; const r = 55;
  const needleX = cx + r * Math.cos(toRad(180 - arcDeg));
  const needleY = cy - r * Math.sin(toRad(arcDeg));
  const drivers = view.sentiment.drivers?.slice(0, 4) ?? [];

  return (
    <DashboardCard title="Market mood" eyebrow="Sentiment" padding="compact">
      <div className="flex items-start gap-5">
        {/* Gauge */}
        <svg width="160" height="80" viewBox="0 0 160 80" className="shrink-0">
          <path d="M 20 70 A 60 60 0 0 1 140 70" fill="none" stroke="#252E42" strokeWidth="10" strokeLinecap="round" />
          {(() => {
            const endX = cx + r * Math.cos(toRad(180 - arcDeg));
            const endY = cy - r * Math.sin(toRad(arcDeg));
            const largeArc = arcDeg > 90 ? 1 : 0;
            return (
              <path
                d={`M 20 70 A 55 55 0 ${largeArc} 1 ${endX.toFixed(1)} ${endY.toFixed(1)}`}
                fill="none" stroke={arcColor} strokeWidth="10" strokeLinecap="round"
              />
            );
          })()}
          <line x1={cx} y1={cy} x2={needleX.toFixed(1)} y2={needleY.toFixed(1)} stroke="#F5F6F8" strokeWidth="2" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="4" fill="#F5F6F8" />
          <text x="14" y="80" fontSize="8" fill="#555E75" textAnchor="middle">Bear</text>
          <text x="146" y="80" fontSize="8" fill="#555E75" textAnchor="middle">Bull</text>
        </svg>

        {/* Right: label + drivers + indices */}
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#8C94A8]">Market</p>
            <p className="text-[18px] font-bold leading-tight" style={{ color: arcColor }}>{arcLabel}</p>
          </div>

          {/* Why: sentiment driver tags */}
          {drivers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {drivers.map((d, i) => (
                <span key={i} className="rounded-[3px] bg-[#1A2130] px-1.5 py-0.5 text-[9px] text-[#8C94A8]">
                  {d}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1 border-t border-[#1F2738] pt-2">
            {view.indices.slice(0, 3).map((idx) => (
              <IndexRow key={idx.name} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

function IndexRow({ index }: { index: MarketIndex }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-[#8C94A8]">{index.name}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-medium tabular-nums text-[#F5F6F8]">
          {index.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </span>
        <span className={`font-mono text-[10px] tabular-nums ${pctClass(index.changePct)}`}>
          {formatPct(index.changePct)}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   BLIND SPOT CARD  — tikrr's differentiator
   ══════════════════════════════════════════════════ */
export function BlindSpotCard({ brief }: { brief: PortfolioBriefData }) {
  if (!brief.blindSpotTitle && !brief.blindSpotBody) return null;
  return (
    <div className="rounded-[10px] border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.05)] p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[16px]">👁</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#FB7185]">Blind spot</span>
      </div>
      {brief.blindSpotTitle && (
        <p className="text-[14px] font-semibold text-[#F5F6F8]">{brief.blindSpotTitle}</p>
      )}
      {brief.blindSpotBody && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#F5F6F8]/70">{brief.blindSpotBody}</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PORTFOLIO SIGNALS CARD
   ══════════════════════════════════════════════════ */
export function SignalsCard({ brief }: { brief: PortfolioBriefData }) {
  const signals = brief.signals?.slice(0, 5) ?? [];
  if (signals.length === 0) return null;

  return (
    <DashboardCard title="Portfolio signals" eyebrow={`${signals.length} from tikrr`} padding="none">
      <ul className="divide-y divide-[#1F2738]">
        {signals.map((signal, i) => {
          const vibeColor =
            signal.vibe === "positive" ? "text-[#22C55E] bg-[rgba(34,197,94,0.1)]" :
            signal.vibe === "negative" ? "text-[#EF4444] bg-[rgba(239,68,68,0.1)]" :
            "text-[#8C94A8] bg-[#1A2130]";
          return (
            <li key={i} className="flex items-start gap-3 px-5 py-3">
              <span className={`mt-0.5 shrink-0 rounded-[3px] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${vibeColor}`}>
                {signal.tag}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#F5F6F8]">{signal.headline}</p>
                {signal.body && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#8C94A8]">{signal.body}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}

/* ══════════════════════════════════════════════════
   EARNINGS THIS WEEK  — horizontal strip
   ══════════════════════════════════════════════════ */
export function EarningsStripCard({ stocks, market }: { stocks: Stock[]; market: "us" | "india" }) {
  const now = Date.now();
  const upcoming = stocks
    .filter((s) => {
      if (!s.earnings.date) return false;
      const ms = Date.parse(s.earnings.date);
      if (!Number.isFinite(ms)) return false;
      const days = (ms - now) / 86400000;
      return days >= 0 && days <= 14;
    })
    .sort((a, b) => Date.parse(a.earnings.date!) - Date.parse(b.earnings.date!));

  if (upcoming.length === 0) return null;

  function daysLabel(iso: string): string {
    const days = Math.round((Date.parse(iso) - now) / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    return `in ${days}d`;
  }

  function dateShort(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <DashboardCard title="Earnings coming up" eyebrow={`Next 14 days · ${upcoming.length} stock${upcoming.length === 1 ? "" : "s"}`} padding="none">
      <div className="flex divide-x divide-[#1F2738] overflow-x-auto">
        {upcoming.map((s) => {
          const days = Math.round((Date.parse(s.earnings.date!) - now) / 86400000);
          const urgency = days <= 2 ? "text-[#EF4444]" : days <= 5 ? "text-[#D4AF37]" : "text-[#8C94A8]";
          return (
            <Link
              key={s.symbol}
              href={`/stock/${encodeURIComponent(s.symbol)}?market=${market}`}
              className="flex min-w-[120px] flex-col gap-1 p-4 transition-colors hover:bg-[#1A2130]"
            >
              <span className="text-[13px] font-bold text-[#F5F6F8]">{s.symbol}</span>
              <span className={`text-[11px] font-semibold ${urgency}`}>{daysLabel(s.earnings.date!)}</span>
              <span className="text-[10px] text-[#555E75]">{dateShort(s.earnings.date!)}</span>
              {s.earnings.epsEstimate !== null && (
                <span className="mt-1 font-mono text-[10px] text-[#8C94A8]">
                  EPS est. {s.earnings.epsEstimate}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </DashboardCard>
  );
}

/* ══════════════════════════════════════════════════
   HEADLINES CARD
   ══════════════════════════════════════════════════ */
export function HeadlinesCard({ headlines }: { headlines: string[] }) {
  if (!headlines || headlines.length === 0) return null;
  return (
    <DashboardCard title="Market headlines" eyebrow="Today">
      <ul className="flex flex-col gap-2.5">
        {headlines.slice(0, 5).map((line, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-[#F5F6F8]/85">
            <span className="mt-0.5 font-mono text-[10px] tabular-nums text-[#555E75]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

/* ══════════════════════════════════════════════════
   NARRATIVE CARD (kept for direct use)
   ══════════════════════════════════════════════════ */
export function NarrativeCard({
  narrative,
  marketBottomLine,
  stockCount,
}: {
  narrative?: string;
  marketBottomLine?: string;
  stockCount?: number;
}) {
  const text = narrative || marketBottomLine;
  if (!text) return null;
  return (
    <DashboardCard title="Your watchlist, in one paragraph" eyebrow="tikrr's read">
      <div className="flex flex-col gap-4 md:flex-row md:gap-8">
        <p className="flex-1 text-[14px] leading-relaxed text-[#F5F6F8]/85">{text}</p>
        {stockCount !== undefined && (
          <div className="flex shrink-0 flex-col gap-0.5 md:justify-center">
            <span className="font-mono text-[28px] font-bold tabular-nums text-[#F5F6F8]">{stockCount}</span>
            <span className="text-[10px] uppercase tracking-wider text-[#8C94A8]">stocks tracked</span>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
