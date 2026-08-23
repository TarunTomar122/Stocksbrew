"use client";

import Link from "next/link";
import { useState } from "react";
import { scrubLegacyBrand } from "@/lib/brand";
import { relativeTime } from "@/lib/freshness";
import type { ThematicScreensDoc, ScreenMatchRow } from "@/lib/screens";
import { StockLogo } from "@/components/stock-logo";
import { ProBadge } from "@/components/pro-badge";
import { ProCtaLink } from "@/components/pro-cta";

type Props = {
  doc?: ThematicScreensDoc | null;
  market: "US" | "IN";
  isSubscribed: boolean;
};

/** Home widget row limits - free users see a short preview + lock. */
const HOME_SCREEN_ROWS_FREE = 3;
const HOME_SCREEN_ROWS_PRO = 8;

const FRIENDLY_COPY: Record<string, { title: string; subtitle: string }> = {
  tikrr_top: {
    title: "Top stocksbrew Score",
    subtitle: "Stocks with the best overall score across growth, momentum, quality and valuation.",
  },
  quality_compounders: {
    title: "Quality Compounders",
    subtitle: "Strong businesses built to grow year after year.",
  },
  cheap_growth: {
    title: "Growth at a Fair Price",
    subtitle: "Still growing fast, not priced for perfection yet.",
  },
  momentum_leaders: {
    title: "On a Tear",
    subtitle: "Strong recent gains with the longer trend intact.",
  },
  oversold_quality: {
    title: "Quality on Sale",
    subtitle: "Great businesses that just got marked down.",
  },
  near_52w_high: {
    title: "Near New Highs",
    subtitle: "Stocks within 3% of their 52-week peak.",
  },
  smart_money: {
    title: "Where the Pros Are",
    subtitle: "Heavy institutional ownership, solid overall scores.",
  },
};

function companyKey(row: ScreenMatchRow): string {
  const raw = String(row.name || "").toLowerCase();
  const cleaned = raw
    .replace(/\bclass\s+[a-z]\b/gi, " ")
    .replace(/\b(incorporated|inc|corp|corporation|co|company|ltd|limited|plc|nv|n\.v\.|sa|s\.a\.)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (cleaned) return `name:${cleaned}`;
  const ticker = String(row.ticker || "").toUpperCase();
  if (ticker === "GOOG" || ticker === "GOOGL") return "ticker:ALPHABET";
  if (ticker === "BRK_A" || ticker === "BRK_B" || ticker === "BRK-A" || ticker === "BRK-B") {
    return "ticker:BERKSHIRE_HATHAWAY";
  }
  return `ticker:${ticker}`;
}

function dedupeByCompany(rows: ScreenMatchRow[]): ScreenMatchRow[] {
  const seen = new Set<string>();
  const out: ScreenMatchRow[] = [];
  for (const row of rows) {
    const key = companyKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function MatchRow({ row, market }: { row: ScreenMatchRow; market: "US" | "IN" }) {
  const change = row.day_change_pct;
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;
  const toneColor = up ? "var(--signal-bullish)" : down ? "var(--signal-bearish)" : "var(--oa-muted-fg)";

  return (
    <Link
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="grid grid-cols-[1.6fr_0.6fr_0.8fr_0.9fr] items-center gap-4 px-5 py-3.5 border-t border-oa-border hover:bg-oa-accent transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <StockLogo ticker={row.ticker} logoUrl={row.logo_url} market={market} size={36} />
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-medium text-oa-fg truncate">
            {row.ticker}
          </span>
          <span className="text-[11px] text-oa-muted-fg truncate">
            {row.name ?? row.sector ?? ""}
          </span>
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end">
        <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-oa-muted-fg">
          Score
        </span>
        <span className="text-[14px] font-medium text-oa-fg tabular-nums">
          {typeof row.overall_score === "number"
            ? Math.round(row.overall_score)
            : "-"}
        </span>
      </div>
      <span className="text-[14px] font-medium text-oa-fg tabular-nums text-right">
        {fmtPrice(row.price)}
      </span>
      <div className="flex justify-end">
        <span
          className="inline-flex items-center gap-1 rounded-md bg-oa-bg px-2 py-1 text-[12px] font-medium tabular-nums"
          style={{ color: toneColor }}
        >
          {up ? "▲" : down ? "▼" : "•"} {fmtPct(change)}
        </span>
      </div>
    </Link>
  );
}

export function ThematicScreens({ doc, market, isSubscribed }: Props) {
  const nonEmpty = (doc?.screens ?? []).filter((s) => s.match_count > 0);
  const [activeId, setActiveId] = useState<string | null>(
    nonEmpty[0]?.id ?? null,
  );

  if (!doc || nonEmpty.length === 0) return null;

  const active = nonEmpty.find((s) => s.id === activeId) ?? nonEmpty[0];
  const copy = FRIENDLY_COPY[active.id] ?? {
    title: active.title,
    subtitle: active.tagline,
  };

  const rowLimit = isSubscribed ? HOME_SCREEN_ROWS_PRO : HOME_SCREEN_ROWS_FREE;
  const uniqueMatches = dedupeByCompany(active.matches);
  const visibleMatches = uniqueMatches.slice(0, rowLimit);
  const showLock = !isSubscribed && uniqueMatches.length > HOME_SCREEN_ROWS_FREE;
  const lockedCount = showLock ? Math.max(0, uniqueMatches.length - HOME_SCREEN_ROWS_FREE) : 0;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-5">
        <div>
          <h2 className="inline-flex items-center gap-2 text-[18px] md:text-[20px] font-medium text-oa-fg tracking-[-0.01em]">
            Screens worth watching
            <ProBadge isSubscribed={isSubscribed} />
          </h2>
          <p className="text-[13px] text-oa-muted-fg mt-1.5 leading-relaxed">
            Curated screens based on growth, momentum, quality and valuation. Skip the screener.
          </p>
        </div>
        <span className="text-[12px] text-oa-muted-fg">
          {relativeTime(doc?.generated_at) ? `Updated ${relativeTime(doc?.generated_at)}` : "Updated daily"}
        </span>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {nonEmpty.map((screen) => {
          const isActive = screen.id === active.id;
          const isHouse = screen.id === "tikrr_top";
          const label =
            FRIENDLY_COPY[screen.id]?.title ?? scrubLegacyBrand(screen.title);
          return (
            <button
              key={screen.id}
              type="button"
              onClick={() => setActiveId(screen.id)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-oa-primary text-white"
                  : "bg-oa-card text-oa-fg border border-oa-border hover:border-oa-fg/30"
              }`}
            >
              {isHouse && (
                <span
                  className={`text-[12px] leading-none ${isActive ? "text-white/70" : "text-oa-primary"}`}
                  aria-hidden
                >
                  ✦
                </span>
              )}
              <span>{label}</span>
              <span
                className={`text-[10px] font-medium tabular-nums rounded-full px-1.5 py-0.5 ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-oa-bg text-oa-muted-fg"
                }`}
              >
                {screen.match_count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[24px] border border-oa-border bg-oa-card overflow-hidden">
        <div className="flex items-baseline justify-between gap-3 flex-wrap px-5 pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-[16px] font-medium text-oa-fg tracking-[-0.01em]">
              {copy.title}
            </h3>
            <p className="text-[13px] text-oa-muted-fg leading-relaxed">
              {copy.subtitle}
            </p>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-oa-muted-fg">
            {uniqueMatches.length} {uniqueMatches.length === 1 ? "match" : "matches"}
          </span>
        </div>

        <div className="grid grid-cols-[1.6fr_0.6fr_0.8fr_0.9fr] gap-4 px-5 pt-5 pb-2 text-[10px] font-medium tracking-[0.12em] uppercase text-oa-muted-fg">
          <span>Stock</span>
          <span className="hidden sm:block text-right">Score</span>
          <span className="text-right">Price</span>
          <span className="text-right">Change</span>
        </div>

        <div className="flex flex-col">
          {visibleMatches.map((row) => (
            <MatchRow key={row.instrument_id} row={row} market={market} />
          ))}
        </div>

        {showLock && (
          <div className="border-t border-oa-border bg-oa-bg px-5 py-7 text-center">
            <p className="text-[14px] font-medium text-oa-fg">
              {lockedCount} more {lockedCount === 1 ? "match" : "matches"} on this screen
            </p>
            <p className="mt-1 text-[13px] text-oa-muted-fg max-w-[420px] mx-auto leading-relaxed">
              Subscribe to unlock the full list, updated daily.
            </p>
            <ProCtaLink href="/subscribe" className="mt-4" showStar>
              Subscribe
            </ProCtaLink>
          </div>
        )}

        {isSubscribed && uniqueMatches.length > HOME_SCREEN_ROWS_PRO && (
          <Link
            href={`/screens/${active.id}?market=${market}`}
            className="flex items-center justify-center gap-1 border-t border-oa-border px-5 py-3 text-[13px] font-medium text-oa-primary hover:bg-oa-accent transition-colors"
          >
            See all {uniqueMatches.length} matches →
          </Link>
        )}
        {!isSubscribed && uniqueMatches.length <= HOME_SCREEN_ROWS_FREE && uniqueMatches.length > 0 && (
          <Link
            href={`/screens/${active.id}?market=${market}`}
            className="flex items-center justify-center gap-1 border-t border-oa-border px-5 py-3 text-[13px] font-medium text-oa-primary hover:bg-oa-accent transition-colors"
          >
            Open screen →
          </Link>
        )}
      </div>
    </section>
  );
}
