"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StockLogo } from "@/components/stock-logo";
import { TrendingNow, type TrendingStock } from "@/components/trending-now";
import type { HeatRow } from "@/lib/heat";
import type { Near52WeekRow } from "@/lib/near-52-week";
import { captureEvent } from "@/lib/posthog";
import type { RedditTicker } from "@/lib/reddit-cues";

function money(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span className="font-mono tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

type Pill = { text: string; color: string };

type ScreenerRow = {
  key: string;
  ticker: string;
  name: string;
  price?: number;
  changePct?: number;
  pills: Pill[];
};

export type RedditRow = RedditTicker & { price?: number; changePct?: number };

type ScreenerCategoryKey = "hot" | "near_high" | "near_low" | "momentum" | "news_spike" | "catalyst" | "dip";

// Mirrors heat-list.tsx's extractCatalystHint: pulls the specific "why" out of
// the reason sentence instead of showing the generic "Upcoming catalyst" driver label.
function extractCatalystHint(sentence: string | undefined, ticker: string): string | null {
  if (!sentence) return null;
  const trimmed = sentence.split(";")[0].trim();
  const withoutPrefix = trimmed.replace(new RegExp(`^${ticker}\\s+has\\s+`, "i"), "");
  return withoutPrefix || null;
}

function rowsFromNear52(rows: Near52WeekRow[], kind: "high" | "low"): ScreenerRow[] {
  return rows.map((r) => {
    const pill =
      kind === "high"
        ? r.pctFromHigh >= 0
          ? { text: `${r.pctFromHigh.toFixed(1)}% above its 52-week high`, color: "var(--signal-bullish)" }
          : { text: `${Math.abs(r.pctFromHigh).toFixed(1)}% below its 52-week high`, color: "var(--primary)" }
        : r.pctFromLow <= 0
          ? { text: `${Math.abs(r.pctFromLow).toFixed(1)}% below its 52-week low`, color: "var(--signal-bearish)" }
          : { text: `${r.pctFromLow.toFixed(1)}% above its 52-week low`, color: "var(--primary)" };
    return {
      key: r.ticker,
      ticker: r.ticker,
      name: r.name,
      price: r.price,
      changePct: r.changePct,
      pills: [pill],
    };
  });
}

function rowsFromHeat(rows: HeatRow[], kind: "hot" | "momentum" | "news_spike" | "catalyst" | "dip"): ScreenerRow[] {
  return rows.map((r) => {
    const pills: Pill[] = [];
    if (kind === "news_spike" && r.multiplier > 0) {
      pills.push({ text: `${r.multiplier.toFixed(1)}x mentions`, color: "var(--primary)" });
    }
    if (kind === "momentum" && typeof r.momentum_score === "number") {
      pills.push({ text: `${Math.round(r.momentum_score)} momentum`, color: "var(--primary)" });
    }
    if (kind === "catalyst") {
      const hint = extractCatalystHint(r.reason_sentence, r.ticker) ?? r.primary_driver;
      if (hint) pills.push({ text: hint.length > 70 ? `${hint.slice(0, 70).trim()}…` : hint, color: "var(--primary)" });
    }
    if (kind === "dip" && typeof r.rsi_14 === "number") {
      pills.push({ text: `Oversold RSI ${Math.round(r.rsi_14)}`, color: "var(--signal-bullish)" });
    }
    if (kind !== "catalyst" && kind !== "dip" && r.heat_direction) {
      pills.push({
        text: r.heat_direction[0].toUpperCase() + r.heat_direction.slice(1),
        color: r.heat_direction === "bullish" ? "var(--signal-bullish)" : r.heat_direction === "caution" ? "var(--signal-bearish)" : "var(--on-surface-variant)",
      });
    }
    if (r.risk_level) pills.push({ text: `${r.risk_level} risk`, color: "var(--on-surface-variant)" });
    return {
      key: r.instrument_id,
      ticker: r.ticker,
      name: r.name,
      price: r.price ?? undefined,
      changePct: r.day_change_pct ?? undefined,
      pills: pills.slice(0, 2),
    };
  });
}

function StockScreener({
  hotStocks,
  nearHighs,
  nearLows,
  momentumStocks,
  newsSpikes,
  catalystStocks,
  dipStocks,
}: {
  hotStocks: HeatRow[];
  nearHighs: Near52WeekRow[];
  nearLows: Near52WeekRow[];
  momentumStocks: HeatRow[];
  newsSpikes: HeatRow[];
  catalystStocks: HeatRow[];
  dipStocks: HeatRow[];
}) {
  const allCategories: { key: ScreenerCategoryKey; label: string; rows: ScreenerRow[] }[] = [
    { key: "hot", label: "Hot stocks", rows: rowsFromHeat(hotStocks, "hot") },
    { key: "momentum", label: "Momentum stocks", rows: rowsFromHeat(momentumStocks, "momentum") },
    { key: "near_high", label: "Near 52-week high", rows: rowsFromNear52(nearHighs, "high") },
    { key: "near_low", label: "Near 52-week low", rows: rowsFromNear52(nearLows, "low") },
    { key: "news_spike", label: "Elevated news mentions", rows: rowsFromHeat(newsSpikes, "news_spike") },
    { key: "catalyst", label: "Catalysts", rows: rowsFromHeat(catalystStocks, "catalyst") },
    { key: "dip", label: "Oversold (dip)", rows: rowsFromHeat(dipStocks, "dip") },
  ];
  const categories = allCategories.filter((c) => c.rows.length > 0);

  const [active, setActive] = useState<ScreenerCategoryKey | null>(categories[0]?.key ?? null);
  if (categories.length === 0) return null;
  const category = categories.find((c) => c.key === active) ?? categories[0];

  function selectCategory(c: { key: ScreenerCategoryKey; label: string; rows: ScreenerRow[] }) {
    setActive(c.key);
    captureEvent("explore_category_selected", { category: c.key, row_count: c.rows.length });
  }

  return (
    <section>
      <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">Stock screener</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant bg-surface md:grid md:grid-cols-[16rem_1fr]">
        {/* Mobile: horizontal scrollable pill tabs. Desktop: left sidebar list. */}
        <div className="flex gap-2 overflow-x-auto border-b border-outline-variant px-4 py-3 md:hidden" style={{ scrollbarWidth: "none" }}>
          {categories.map((c) => {
            const isActive = c.key === category.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectCategory(c)}
                className="shrink-0 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors"
                style={
                  isActive
                    ? {
                        color: "var(--primary)",
                        borderColor: "color-mix(in srgb, var(--primary) 45%, var(--outline-variant))",
                        background: "color-mix(in srgb, var(--primary) 10%, var(--surface))",
                      }
                    : { color: "var(--on-surface-variant)", borderColor: "var(--outline-variant)" }
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="hidden min-w-0 md:block md:max-h-[32rem] md:overflow-y-auto md:border-r md:border-outline-variant">
          {categories.map((c) => {
            const isActive = c.key === category.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectCategory(c)}
                className="flex w-full items-center border-t border-outline-variant/70 px-4 py-7 text-left first:border-t-0 hover:bg-surface-container-low md:border-t-0 md:border-b"
                style={isActive ? { background: "color-mix(in srgb, var(--primary) 8%, var(--surface))" } : undefined}
              >
                <span
                  className="text-[15.5px] font-medium"
                  style={{ color: isActive ? "var(--primary)" : "var(--on-surface)" }}
                >
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="max-h-[26rem] min-w-0 overflow-y-auto bg-surface md:max-h-[32rem]">
          {category.rows.map((row) => (
            <Link
              key={row.key}
              href={`/stock/${row.ticker}`}
              onClick={() => captureEvent("explore_stock_clicked", { ticker: row.ticker, section: "screener", category: category.key })}
              className="grid grid-cols-[2rem_5rem_1fr_4.5rem] items-center gap-2 border-t border-outline-variant/70 px-3 py-4 first:border-t-0 hover:bg-surface-container-low sm:grid-cols-[2rem_10rem_1fr_6rem] sm:gap-3 sm:px-5"
            >
              <StockLogo ticker={row.ticker} market="US" size={32} />
              <div className="min-w-0">
                <p className="text-[15.5px] font-medium text-on-surface">{row.ticker}</p>
                {row.name ? <p className="truncate text-[13px] leading-snug text-on-surface-variant">{row.name}</p> : null}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {row.pills.map((pill) => (
                  <span
                    key={pill.text}
                    className="rounded-lg px-2 py-1 text-[11.5px] font-medium leading-snug sm:rounded-full sm:px-2.5 sm:text-[12px]"
                    style={{ color: pill.color, background: `color-mix(in srgb, ${pill.color} 12%, var(--surface))` }}
                  >
                    {pill.text}
                  </span>
                ))}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {typeof row.price === "number" ? (
                  <span className="text-[15px] font-medium tabular-nums text-on-surface">${money(row.price)}</span>
                ) : null}
                {typeof row.changePct === "number" ? (
                  <span className="text-[13px] font-medium">{pctLabel(row.changePct)}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function sentimentColor(sentiment: string) {
  if (sentiment === "bearish") return "var(--signal-bearish)";
  if (sentiment === "bullish") return "var(--signal-bullish)";
  return "var(--on-surface-variant)";
}

function RedditCard({ row }: { row: RedditRow }) {
  return (
    <Link
      href={`/stock/${row.ticker}`}
      onClick={() => captureEvent("explore_stock_clicked", { ticker: row.ticker, section: "reddit_buzz" })}
      className="rounded-xl border border-outline-variant bg-surface p-4 hover:bg-surface-container-low"
    >
      <div className="flex items-center gap-3">
        <StockLogo ticker={row.ticker} market="US" size={32} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-on-surface">{row.ticker}</p>
        </div>
        {typeof row.price === "number" ? (
          <div className="shrink-0 text-right">
            <p className="text-[14px] font-medium tabular-nums text-on-surface">${money(row.price)}</p>
            {typeof row.changePct === "number" ? <p className="text-[12.5px] font-medium">{pctLabel(row.changePct)}</p> : null}
          </div>
        ) : null}
      </div>
      <span
        className="mt-3 inline-block rounded-full px-2.5 py-1 text-[11.5px] font-medium capitalize"
        style={{ color: sentimentColor(row.sentiment), background: `color-mix(in srgb, ${sentimentColor(row.sentiment)} 12%, var(--surface))` }}
      >
        {row.sentiment}
      </span>
      {row.summary ? (
        <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant">{row.summary}</p>
      ) : null}
      {row.mention_count ? (
        <p className="mt-3 text-[12px] text-on-surface-variant">{row.mention_count} mentions</p>
      ) : null}
    </Link>
  );
}

function RedditBuzz({ redditTickers }: { redditTickers: RedditRow[] }) {
  const top = redditTickers.slice(0, 6);
  if (top.length === 0) return null;

  return (
    <section>
      <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">Reddit buzz</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((row) => (
          <RedditCard key={row.ticker} row={row} />
        ))}
      </div>
    </section>
  );
}

export function ExploreHub({
  trending,
  hotStocks,
  nearHighs,
  nearLows,
  momentumStocks,
  newsSpikes,
  catalystStocks,
  dipStocks,
  redditTickers,
}: {
  trending: TrendingStock[];
  hotStocks: HeatRow[];
  nearHighs: Near52WeekRow[];
  nearLows: Near52WeekRow[];
  momentumStocks: HeatRow[];
  newsSpikes: HeatRow[];
  catalystStocks: HeatRow[];
  dipStocks: HeatRow[];
  redditTickers: RedditRow[];
}) {
  useEffect(() => {
    captureEvent("explore_viewed", {
      hot_count: hotStocks.length,
      near_high_count: nearHighs.length,
      near_low_count: nearLows.length,
      momentum_count: momentumStocks.length,
      news_spike_count: newsSpikes.length,
      catalyst_count: catalystStocks.length,
      dip_count: dipStocks.length,
      reddit_count: redditTickers.length,
    });
    // Fires once per mount to mark the page view; category/row counts are a snapshot, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <TrendingNow stocks={trending} />
      <RedditBuzz redditTickers={redditTickers} />
      <StockScreener
        hotStocks={hotStocks}
        nearHighs={nearHighs}
        nearLows={nearLows}
        momentumStocks={momentumStocks}
        newsSpikes={newsSpikes}
        catalystStocks={catalystStocks}
        dipStocks={dipStocks}
      />
    </div>
  );
}
