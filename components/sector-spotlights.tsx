"use client";

import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { SnapshotRow } from "@/lib/types";

type Theme = {
  slug: string;
  label: string;
  icon: string;
  bg: string;
  fg: string;
  /** Tickers that define this theme. Matched case-insensitively against snapshot symbols. */
  tickers: string[];
};

const SEMI_TICKERS = [
  "NVDA", "AMD", "INTC", "TSM", "AVGO", "MU", "QCOM", "ASML", "LRCX", "AMAT",
  "ADI", "MRVL", "ON", "KLAC", "MCHP", "TXN", "NXPI", "MPWR", "STM", "SWKS",
  "QRVO", "ARM", "AMKR", "SMCI",
];

const TECH_TICKERS = [
  "AAPL", "MSFT", "GOOGL", "GOOG", "META", "AMZN", "NFLX", "ADBE", "CRM",
  "ORCL", "NOW", "SHOP", "CRWD", "SNOW", "DDOG", "NET", "ZS", "TEAM", "MDB",
  "OKTA", "PANW", "FTNT", "INTU", "WDAY", "IBM", "SAP", "UBER", "ABNB",
  "DOCU", "ROKU", "SPOT", "PINS", "SNAP", "SQ", "PYPL", "TSLA",
];

const INDUSTRIAL_TICKERS = [
  "CAT", "DE", "HON", "UNP", "UPS", "FDX", "GE", "EMR", "MMM", "ROK",
  "ETN", "PH", "PCAR", "URI", "NSC", "CSX", "ITW", "JCI", "PWR", "FAST",
  "GWW", "CMI", "WM", "RSG",
];

const DEFENSE_TICKERS = [
  "LMT", "RTX", "NOC", "GD", "LHX", "HII", "TDG", "AXON", "BA", "HEI",
  "KTOS", "LDOS", "PLTR",
];

const DEFAULT_THEMES: Theme[] = [
  { slug: "tech",           label: "Tech",           icon: "computer",                bg: "#0052ff", fg: "#ffffff", tickers: TECH_TICKERS },
  { slug: "semiconductors", label: "Semiconductors", icon: "memory",                  bg: "#7c3aed", fg: "#ffffff", tickers: SEMI_TICKERS },
  { slug: "industrials",    label: "Industrials",    icon: "precision_manufacturing", bg: "#475569", fg: "#ffffff", tickers: INDUSTRIAL_TICKERS },
  { slug: "defense",        label: "Defense",        icon: "shield",                  bg: "#0f172a", fg: "#ffffff", tickers: DEFENSE_TICKERS },
];

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function tickerColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0;
  const palette = ["#1c1c1e", "#0052ff", "#7c3aed", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#ec4899"];
  return palette[hash % palette.length];
}

/** Non‑Pro: this many movers per theme card; Pro sees the full sorted list (scroll). */
const FREE_SECTOR_SPOTLIGHT_ROWS = 3;

type Props = {
  snapshotRows: SnapshotRow[];
  title?: string;
  themes?: Theme[];
  trackedIds?: string[];
  isSubscribed?: boolean;
};

export function SectorSpotlights({
  snapshotRows,
  title = "Sector spotlights",
  themes = DEFAULT_THEMES,
  trackedIds = [],
  isSubscribed = false,
}: Props) {
  if (snapshotRows.length === 0) return null;

  const trackedSet = new Set(trackedIds);
  const bySymbol = new Map<string, SnapshotRow>();
  for (const row of snapshotRows) {
    if (row.symbol) bySymbol.set(row.symbol.toUpperCase(), row);
  }

  const cards = themes
    .map((theme) => {
      const stocks = theme.tickers
        .map((t) => bySymbol.get(t.toUpperCase()))
        .filter((r): r is SnapshotRow => Boolean(r))
        .map((r) => ({
          ticker: r.symbol,
          instrumentId: r.instrumentId,
          name: r.name || r.symbol,
          price: r.price?.current ?? 0,
          changePct: r.price?.changePct ?? 0,
        }))
        .filter((s) => Number.isFinite(s.changePct))
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

      const avg =
        stocks.length > 0
          ? stocks.reduce((sum, s) => sum + s.changePct, 0) / stocks.length
          : 0;

      return { theme, stocks, avg };
    })
    .filter((c) => c.stocks.length > 0);

  if (cards.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <h2 className="text-[16px] md:text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
          {title}
        </h2>
        <span className="text-[12px] text-[#6b7280]">
          {cards.length} sectors tracked
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ theme, stocks, avg }) => (
          <SectorCard
            key={theme.slug}
            theme={theme}
            stocks={stocks}
            avg={avg}
            trackedSet={trackedSet}
            isSubscribed={isSubscribed}
          />
        ))}
      </div>
    </section>
  );
}

type SectorStock = {
  ticker: string;
  instrumentId: string;
  name: string;
  price: number;
  changePct: number;
};

function SectorCard({
  theme,
  stocks,
  avg,
  trackedSet,
  isSubscribed,
}: {
  theme: Theme;
  stocks: SectorStock[];
  avg: number;
  trackedSet: Set<string>;
  isSubscribed: boolean;
}) {
  const positive = avg >= 0;
  const visible = isSubscribed ? stocks : stocks.slice(0, FREE_SECTOR_SPOTLIGHT_ROWS);
  const lockedCount = !isSubscribed
    ? Math.max(0, stocks.length - FREE_SECTOR_SPOTLIGHT_ROWS)
    : 0;

  return (
    <div className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: theme.bg, color: theme.fg }}
          aria-hidden
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, fontVariationSettings: "'wght' 500" }}
          >
            {theme.icon}
          </span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[14px] font-semibold text-[#111111] truncate tracking-[-0.01em]">
            {theme.label}
          </span>
          <span
            className={`text-[12px] font-semibold tabular-nums ${
              positive ? "text-[#10b981]" : "text-[#ef4444]"
            }`}
          >
            {positive ? "▲" : "▼"} {Math.abs(avg).toFixed(2)}% avg
          </span>
        </div>
      </div>

      <div
        className={`flex flex-col ${
          isSubscribed && stocks.length > FREE_SECTOR_SPOTLIGHT_ROWS
            ? "max-h-[420px] overflow-y-auto scrollbar-hide"
            : ""
        }`}
      >
        {visible.map((s) => {
          const up = s.changePct > 0;
          const down = s.changePct < 0;
          const fallbackBg = tickerColor(s.ticker);
          return (
            <div
              key={s.ticker}
              className="group flex items-center gap-3 px-5 py-2.5 border-t border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors"
            >
              <Link
                href={`/stock/${encodeURIComponent(s.ticker)}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <StockLogo
                  ticker={s.ticker}
                  size={32}
                  fallbackBg={fallbackBg}
                />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] font-semibold text-[#111111] truncate">
                    {s.name}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] text-[#6b7280] tabular-nums">
                      ${fmtPrice(s.price)}
                    </span>
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        up ? "text-[#10b981]" : down ? "text-[#ef4444]" : "text-[#6b7280]"
                      }`}
                    >
                      {up ? "▲" : down ? "▼" : "•"} {Math.abs(s.changePct).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </Link>
              <TrackButton
                ticker={s.ticker}
                instrumentId={s.instrumentId}
                isTracked={trackedSet.has(s.instrumentId)}
                isSubscribed={isSubscribed}
                variant="icon"
              />
            </div>
          );
        })}
      </div>

      {lockedCount > 0 && (
        <div className="border-t border-[#f3f4f6] bg-gradient-to-b from-[#fafafa] to-white px-4 py-3">
          <Link
            href="/subscribe"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111111] shadow-sm transition-colors hover:border-[#111111] hover:bg-[#fafafa]"
          >
            <span className="text-[15px]" aria-hidden>
              🔒
            </span>
            Unlock {lockedCount} more on Pro
          </Link>
        </div>
      )}
    </div>
  );
}
