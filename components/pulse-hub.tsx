"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { FeedUnlockBar } from "@/components/feed-row-lock-teaser";
import type { ScannerItem } from "@/components/movers-scanner";
import { PriceChart } from "@/components/price-chart";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import { StockLogo } from "@/components/stock-logo";
import type { OpeningCue, OpeningReport, OpeningSession } from "@/lib/premarket-opening";
import type { PremarketMovers } from "@/lib/premarket";
import { captureEvent } from "@/lib/posthog";

function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span className="font-mono tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function money(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateLabel(raw?: string) {
  if (!raw) return null;
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00-04:00` : raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TONE_COLOR: Record<string, string> = {
  positive: "var(--signal-bullish)",
  negative: "var(--signal-bearish)",
  neutral: "var(--signal-neutral)",
};

function PremarketScrollCards({ title, tone, rows }: { title: string; tone: "up" | "down"; rows: PremarketMovers["gappers_up"] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const color = tone === "up" ? "var(--signal-bullish)" : "var(--signal-bearish)";

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows, rows.length]);

  if (rows.length === 0) return null;
  const scrollBy = (dir: 1 | -1) => scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium" style={{ color }}>{title}</p>
        {canScrollLeft || canScrollRight ? (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label="Scroll left"
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface disabled:opacity-30 enabled:hover:bg-surface-container-low"
            >
              <span className="leading-none" style={{ transform: "translateY(-1px)" }}>‹</span>
            </button>
            <button
              type="button"
              aria-label="Scroll right"
              disabled={!canScrollRight}
              onClick={() => scrollBy(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant text-on-surface disabled:opacity-30 enabled:hover:bg-surface-container-low"
            >
              <span className="leading-none" style={{ transform: "translateY(-1px)" }}>›</span>
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={scrollerRef}
        onScroll={updateArrows}
        className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {rows.map((row) => (
          <Link
            key={row.instrument_id}
            href={`/stock/${row.ticker}`}
            className="flex w-40 shrink-0 flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4 hover:bg-surface-container-low sm:w-44"
          >
            <div className="flex items-center gap-2">
              <StockLogo ticker={row.ticker} market="US" size={28} />
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-on-surface">{row.ticker}</p>
                <p className="truncate text-[12.5px] text-on-surface-variant">{row.name}</p>
              </div>
            </div>
            <div>
              <p className="text-[16px] font-medium tabular-nums text-on-surface">${money(row.pre_market_price)}</p>
              <p className="text-[13.5px] font-medium">{pctLabel(row.pre_market_change_pct)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FuturesRow({ cues }: { cues: OpeningCue[] }) {
  const futures = cues.filter((c) => c.group === "futures").slice(0, 3);
  if (futures.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {futures.map((cue) => (
        <span
          key={cue.id}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-outline-variant px-3 py-1.5 text-[13px]"
        >
          <span className="font-medium text-on-surface">{cue.label}</span>
          {pctLabel(cue.change_pct)}
        </span>
      ))}
    </div>
  );
}

function SessionsTrend({ sessions }: { sessions: OpeningSession[] }) {
  const rows = sessions.slice(-5);
  if (rows.length === 0) return null;
  const maxAbs = Math.max(1, ...rows.map((s) => Math.abs(s.change_pct)));
  const latest = rows[rows.length - 1];
  const latestColor = latest.change_pct >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return (
    <div className="shrink-0 rounded-xl border border-outline-variant p-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11.5px] font-medium text-on-surface-variant">Last {rows.length} sessions</p>
        <span className="text-[12px] font-medium tabular-nums" style={{ color: latestColor }}>
          {latest.change_pct >= 0 ? "+" : ""}{latest.change_pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 flex h-8 items-end gap-1">
        {rows.map((s) => {
          const up = s.change_pct >= 0;
          const color = up ? "var(--signal-bullish)" : "var(--signal-bearish)";
          const barHeightPct = Math.max(15, (Math.abs(s.change_pct) / maxAbs) * 100);
          return (
            <div key={s.date} title={`${dateLabel(s.date)} ${up ? "+" : ""}${s.change_pct.toFixed(1)}%`} className="flex h-full w-4 items-end">
              <div className="w-full rounded-t" style={{ height: `${barHeightPct}%`, background: color }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Only these buckets are worth a tile; everything else (Industrials,
// Utilities, ...) is noise for a "what's moving" heatmap. All Consumer*
// GICS sectors collapse into one bucket per request.
const SECTOR_BUCKET: Record<string, string> = {
  "technology": "Tech",
  "information technology": "IT",
  "energy": "Energy",
  "materials": "Materials",
  "health care": "Healthcare",
  "healthcare": "Healthcare",
  "consumer staples": "Consumers",
  "consumer discretionary": "Consumers",
  "consumer cyclical": "Consumers",
  "consumer defensive": "Consumers",
};

// Bellwethers used to pad a sector's logo row out to 3 distinct companies
// when fewer than 3 stocks in that sector are actually gapping today.
const SECTOR_BELLWETHERS: Record<string, string[]> = {
  Tech: ["AAPL", "MSFT", "NVDA"],
  IT: ["ORCL", "CRM", "ADBE"],
  Energy: ["XOM", "CVX", "COP"],
  Materials: ["LIN", "SHW", "FCX"],
  Healthcare: ["UNH", "JNJ", "PFE"],
  Consumers: ["AMZN", "WMT", "PG"],
};

function SectorPulse({ movers }: { movers: PremarketMovers | null }) {
  const rows = [...(movers?.gappers_up ?? []), ...(movers?.gappers_down ?? [])];
  const bySector = new Map<string, { sum: number; count: number; tickers: { ticker: string; pct: number }[] }>();
  for (const row of rows) {
    const sector = SECTOR_BUCKET[row.sector?.trim().toLowerCase() ?? ""];
    if (!sector) continue;
    const entry = bySector.get(sector) ?? { sum: 0, count: 0, tickers: [] };
    entry.sum += row.pre_market_change_pct;
    entry.count += 1;
    entry.tickers.push({ ticker: row.ticker, pct: row.pre_market_change_pct });
    bySector.set(sector, entry);
  }
  const ranked = Array.from(bySector.entries())
    .map(([sector, { sum, count, tickers }]) => ({
      sector,
      avg: sum / count,
      count,
      topTickers: [...tickers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4),
    }))
    // Tile size and color intensity both scale with how big the average move
    // is, so the sector moving the most is always the biggest tile.
    .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg));
  if (ranked.length === 0) return null;
  const maxAbs = Math.max(1, ...ranked.map((s) => Math.abs(s.avg)));
  const COLS = 4;
  // The first 3 tiles form a fixed 2x2 + two 2x1 block that exactly fills two
  // full rows. Everything after that is 1x1 - except the first tile of the
  // final partial row, which stretches to swallow whatever's left over so
  // the grid always ends flush. That tile is picked because tiles are
  // sorted by magnitude descending, so it's the biggest mover in that row
  // (not the smallest, which would misleadingly outsize a bigger neighbor).
  const smallCount = Math.max(0, ranked.length - 3);
  const remainder = smallCount % COLS;
  const fillIndex = ranked.length - remainder;
  // Tailwind's JIT only picks up literal class strings, so the fill span for
  // the trailing tile is looked up rather than interpolated.
  const FILL_SPAN_CLASS: Record<number, string> = { 2: "col-span-2", 3: "col-span-3", 4: "col-span-4" };
  const spanClass = (rank: number) => {
    if (ranked.length < 5) return "col-span-1 row-span-1";
    if (rank === 0) return "col-span-2 row-span-2";
    if (rank <= 2) return "col-span-2 row-span-1";
    if (rank === fillIndex && remainder !== 0) {
      return `${FILL_SPAN_CLASS[COLS - remainder + 1] ?? "col-span-1"} row-span-1`;
    }
    return "col-span-1 row-span-1";
  };

  return (
    <div className="mt-5">
      <p className="text-[13px] font-medium text-on-surface-variant">Sector pulse</p>
      <div className="mt-2.5 overflow-hidden rounded-xl border border-outline-variant">
        <div className="grid grid-cols-4 gap-px bg-outline-variant [grid-auto-rows:4.5rem]">
          {ranked.map((s, i) => {
            const up = s.avg >= 0;
            const tone = up ? "var(--signal-bullish)" : "var(--signal-bearish)";
            const intensity = Math.min(1, Math.abs(s.avg) / maxAbs);
            const logoTickers = [
              ...new Set([...s.topTickers.map((t) => t.ticker), ...(SECTOR_BELLWETHERS[s.sector] ?? [])]),
            ].slice(0, 3);
            return (
              <div
                key={s.sector}
                className={`flex flex-col justify-between px-3 py-2.5 ${spanClass(i)}`}
                style={{ background: `color-mix(in srgb, ${tone} ${8 + intensity * 30}%, var(--surface))` }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-on-surface-variant">{s.sector}</p>
                  <div className="flex shrink-0 -space-x-2">
                    {logoTickers.map((ticker) => (
                      <span key={ticker} className="overflow-hidden rounded-full border border-outline-variant bg-surface">
                        <StockLogo ticker={ticker} market="US" size={22} />
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-[15px] font-semibold tabular-nums" style={{ color: tone }}>
                  {up ? "+" : ""}{s.avg.toFixed(1)}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Caller (pulse-hub-stream.tsx) already gates movers/report on
// isPremarketLive, so both are null outside the pre-market window.
function PremarketStrip({ movers, report }: { movers: PremarketMovers | null; report: OpeningReport | null }) {
  if (!movers && !report) return null;
  const label = dateLabel(movers?.date || report?.generated_at);
  const color = TONE_COLOR[report?.direction ?? "neutral"] ?? TONE_COLOR.neutral;
  const gainers = [...(movers?.gappers_up ?? [])].sort((a, b) => b.pre_market_change_pct - a.pre_market_change_pct).slice(0, 8);
  const losers = [...(movers?.gappers_down ?? [])].sort((a, b) => a.pre_market_change_pct - b.pre_market_change_pct).slice(0, 8);

  return (
    <section className="border-b border-outline-variant pb-8">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">Pre-market</h2>
        {label ? <span className="text-[13px] text-on-surface-variant">{label}</span> : null}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        {report ? (
          <div className="flex min-w-0 items-baseline gap-2 sm:gap-3">
            <span className="text-[40px] font-medium leading-none tabular-nums sm:text-[64px]" style={{ color }}>{Math.round(report.score)}</span>
            <div className="min-w-0">
              <span className="text-[13px] text-on-surface-variant sm:text-[16px]">/100</span>
              <p className="truncate text-[14px] font-medium sm:text-[17px]" style={{ color }}>{report.label}</p>
            </div>
          </div>
        ) : <div />}
        <SessionsTrend sessions={report?.sessions ?? []} />
      </div>
      <FuturesRow cues={report?.global_cues ?? []} />
      <SectorPulse movers={movers} />
      <PremarketScrollCards title="Gapping up" tone="up" rows={gainers} />
      <PremarketScrollCards title="Gapping down" tone="down" rows={losers} />
    </section>
  );
}

type MoverTab = "gainers" | "losers";

type StockChartExtras = {
  week52High: number | null;
  week52Low: number | null;
  rsi14: number | null;
  rsiState: string | null;
};

function useStockChart(instrumentId?: string) {
  const [data, setData] = useState<{ date: string; close: number }[]>([]);
  const [extras, setExtras] = useState<StockChartExtras | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!instrumentId) {
      setData([]);
      setExtras(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pulse-stock-chart?instrument_id=${encodeURIComponent(instrumentId)}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setData(Array.isArray(body?.data) ? body.data : []);
        setExtras({
          week52High: typeof body?.week52High === "number" ? body.week52High : null,
          week52Low: typeof body?.week52Low === "number" ? body.week52Low : null,
          rsi14: typeof body?.rsi14 === "number" ? body.rsi14 : null,
          rsiState: typeof body?.rsiState === "string" ? body.rsiState : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setData([]);
          setExtras(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instrumentId]);

  return { data, extras, loading };
}

const FREE_ROW_LIMIT = 3;

function TodayMovers({ items, isSubscribed }: { items: ScannerItem[]; isSubscribed: boolean }) {
  const [tab, setTab] = useState<MoverTab>("gainers");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const hasRealAnomaly = (i: ScannerItem) => {
    const headline = (i.headline || "").trim();
    const why = (i.whyItMatters || "").trim();
    return (headline.length > 0 && headline !== "--") || (why.length > 0 && why !== "--");
  };
  const withAnomaly = items.filter(hasRealAnomaly);
  const winners = [...withAnomaly].filter((i) => i.changePct >= 0).sort((a, b) => b.changePct - a.changePct);
  const losers = [...withAnomaly].filter((i) => i.changePct < 0).sort((a, b) => a.changePct - b.changePct);
  const label = dateLabel(new Date().toISOString());
  const rows = tab === "gainers" ? winners : losers;
  const selectedIndex = rows.findIndex((r) => r.ticker === selectedTicker);
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : rows[0] ?? null;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const locked = !isSubscribed && activeIndex >= FREE_ROW_LIMIT;
  const { data: chartData, extras: chartExtras, loading: chartLoading } = useStockChart(selected?.instrument_id);

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">Today&apos;s gainers &amp; losers</h2>
        {label ? <span className="text-[13px] text-on-surface-variant">{label}</span> : null}
      </div>

      {winners.length || losers.length ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant bg-surface md:grid md:min-h-[38rem] md:grid-cols-[19rem_1fr]">
          <div className="min-w-0 md:border-r md:border-outline-variant">
            <div className="flex gap-2 border-b border-outline-variant px-4 py-3">
              {([
                ["gainers", "Gainers"],
                ["losers", "Losers"],
              ] as const).map(([key, tabLabel]) => {
                const active = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTab(key);
                      setSelectedTicker(null);
                      setMobileDetailOpen(false);
                      captureEvent("pulse_movers_tab_selected", { tab: key });
                    }}
                    className="rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                    style={
                      active
                        ? {
                            color: "var(--primary)",
                            borderColor: "color-mix(in srgb, var(--primary) 45%, var(--outline-variant))",
                            background: "color-mix(in srgb, var(--primary) 10%, var(--surface))",
                          }
                        : { color: "var(--on-surface-variant)", borderColor: "var(--outline-variant)" }
                    }
                  >
                    {tabLabel}
                  </button>
                );
              })}
            </div>
            <div className="max-h-[38rem] overflow-y-auto">
              {rows.map((row, index) => {
                const active = selected?.ticker === row.ticker && activeIndex === index;
                const rowLocked = !isSubscribed && index >= FREE_ROW_LIMIT;
                return (
                  <button
                    key={row.ticker}
                    type="button"
                    onClick={() => {
                      setSelectedTicker(row.ticker);
                      setMobileDetailOpen(true);
                      captureEvent("pulse_mover_selected", { ticker: row.ticker, tab, locked: rowLocked });
                    }}
                    className="flex w-full items-center gap-3 border-t border-outline-variant/70 px-4 py-3 text-left first:border-t-0 hover:bg-surface-container-low"
                    style={active ? { background: "color-mix(in srgb, var(--primary) 8%, var(--surface))" } : undefined}
                  >
                    <StockLogo ticker={row.ticker} market="US" size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-on-surface">{row.ticker}</p>
                      {row.company ? <p className="truncate text-[12px] text-on-surface-variant">{row.company}</p> : null}
                    </div>
                    {rowLocked ? (
                      <AnimatedIcon name="lock" size={14} className="shrink-0 text-on-surface-variant" aria-hidden />
                    ) : null}
                    <span className="shrink-0 text-[12.5px] font-medium">{pctLabel(row.changePct)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={`min-w-0 bg-surface p-3 sm:p-6 md:static md:inset-auto md:z-auto md:block md:overflow-visible md:border-t md:border-outline-variant md:p-6 ${
              mobileDetailOpen ? "fixed inset-0 z-50 overflow-y-auto" : "hidden"
            }`}
          >
            {selected ? (
              <>
                <button
                  type="button"
                  onClick={() => setMobileDetailOpen(false)}
                  className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-on-surface-variant md:hidden"
                >
                  <span aria-hidden>←</span> Back
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  <StockLogo ticker={selected.ticker} market="US" size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[18px] font-semibold tracking-tight text-on-surface">
                      {selected.ticker}{selected.company ? ` · ${selected.company}` : ""}
                    </p>
                    <p className="text-[15px] font-medium">
                      ${money(selected.price)} · {pctLabel(selected.changePct)}
                    </p>
                  </div>
                  <Link
                    href={`/stock/${selected.ticker}`}
                    onClick={() => captureEvent("pulse_mover_open_stock_page", { ticker: selected.ticker, tab })}
                    className="shrink-0 rounded-full border border-outline-variant px-3.5 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-surface-container-low sm:ml-auto"
                  >
                    Open stock page →
                  </Link>
                </div>

                {locked ? (
                  <div className="relative mt-4 min-h-[24rem] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low/50">
                    <div aria-hidden className="pointer-events-none select-none space-y-4 p-6 blur-[6px]">
                      <div className="overflow-hidden rounded-xl border border-outline-variant">
                        {chartData.length > 1 ? (
                          <PriceChart data={chartData} currency="$" embedded currentPrice={selected.price} height={180} />
                        ) : (
                          <div className="h-[180px] bg-surface-container-high" />
                        )}
                      </div>
                      <div className="h-4 w-3/4 rounded bg-surface-container-high" />
                      <div className="h-3 w-full rounded bg-surface-container-high" />
                      <div className="h-3 w-5/6 rounded bg-surface-container-high" />
                      {chartExtras && (Number.isFinite(chartExtras.week52High) || Number.isFinite(chartExtras.rsi14)) ? (
                        <div className="grid grid-cols-1 gap-6 border-t border-outline-variant pt-4 sm:grid-cols-2">
                          {Number.isFinite(chartExtras.week52High) && Number.isFinite(chartExtras.week52Low) ? (
                            <RangeBar
                              label="52-week range"
                              low={chartExtras.week52Low!}
                              high={chartExtras.week52High!}
                              current={selected.price}
                              format={(v) => `$${money(v)}`}
                            />
                          ) : null}
                          {Number.isFinite(chartExtras.rsi14) ? (
                            <RsiStrength value={chartExtras.rsi14!} state={chartExtras.rsiState ?? undefined} />
                          ) : null}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-6 border-t border-outline-variant pt-4 sm:grid-cols-2">
                          {[0, 1].map((col) => (
                            <div key={col} className="space-y-2.5">
                              <div className="h-3 w-24 rounded bg-surface-container-high" />
                              <div className="h-8 w-full rounded bg-surface-container-high" />
                              <div className="h-2 w-full rounded-full bg-surface-container-high" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-surface/85 px-6 backdrop-blur-[2px]">
                      <div className="text-center">
                        <p className="text-[16px] font-medium text-on-surface">See why {selected.ticker} moved</p>
                        <p className="mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-on-surface-variant">
                          Track it to unlock the chart, key indicators, and the full reasoning for every mover on this list.
                        </p>
                        <div className="mt-4 flex justify-center">
                          <FeedUnlockBar
                            surface="market_anomalies"
                            compact
                            signedOutLabel="Start your 3-day free trial"
                            signedInLabel="Unlock Pro"
                            buttonClassName="!rounded-full !border-none !bg-primary !text-on-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {selected.tag || selected.confidence || selected.buzz || selected.overallLabel ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selected.overallLabel && selected.overallScore != null ? (
                          <span
                            className="rounded-full px-2.5 py-1 text-[12px] font-medium capitalize"
                            style={{
                              color: selected.overallLabel === "bullish" ? "var(--signal-bullish)" : selected.overallLabel === "bearish" ? "var(--signal-bearish)" : "var(--on-surface-variant)",
                              background: "color-mix(in srgb, currentColor 10%, var(--surface))",
                            }}
                          >
                            {selected.overallLabel} · {Math.round(selected.overallScore)}/100
                          </span>
                        ) : null}
                        {selected.tag && selected.tag !== "--" ? (
                          <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-[12px] font-medium text-on-surface-variant">
                            {selected.tag}
                          </span>
                        ) : null}
                        {selected.confidence ? (
                          <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-[12px] font-medium capitalize text-on-surface-variant">
                            {selected.confidence} confidence
                          </span>
                        ) : null}
                        {selected.buzz ? (
                          <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-[12px] font-medium capitalize text-on-surface-variant">
                            Reddit: {selected.buzz}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 overflow-hidden rounded-xl border border-outline-variant">
                      {chartLoading ? (
                        <div className="h-[180px] animate-pulse bg-surface-container-high" />
                      ) : chartData.length > 1 ? (
                        <PriceChart data={chartData} currency="$" embedded currentPrice={selected.price} height={180} />
                      ) : (
                        <div className="flex h-[100px] items-center justify-center text-[13px] text-on-surface-variant">
                          No chart data available
                        </div>
                      )}
                    </div>

                    {selected.headline ? (
                      <p className="mt-4 text-[16px] font-medium leading-snug text-on-surface">{selected.headline}</p>
                    ) : null}
                    {selected.whyItMatters ? (
                      <p className="mt-2 text-[14.5px] leading-relaxed text-on-surface-variant">{selected.whyItMatters}</p>
                    ) : null}

                    {chartLoading ? (
                      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-outline-variant pt-4 sm:grid-cols-2">
                        {[0, 1].map((col) => (
                          <div key={col} className="animate-pulse space-y-2.5">
                            <div className="h-3 w-24 rounded bg-surface-container-high" />
                            <div className="h-8 w-full rounded bg-surface-container-high" />
                            <div className="h-2 w-full rounded-full bg-surface-container-high" />
                          </div>
                        ))}
                      </div>
                    ) : chartExtras && (Number.isFinite(chartExtras.week52High) || Number.isFinite(chartExtras.rsi14)) ? (
                      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-outline-variant pt-4 sm:grid-cols-2">
                        {Number.isFinite(chartExtras.week52High) && Number.isFinite(chartExtras.week52Low) ? (
                          <RangeBar
                            label="52-week range"
                            low={chartExtras.week52Low!}
                            high={chartExtras.week52High!}
                            current={selected.price}
                            format={(v) => `$${money(v)}`}
                          />
                        ) : null}
                        {Number.isFinite(chartExtras.rsi14) ? (
                          <RsiStrength value={chartExtras.rsi14!} state={chartExtras.rsiState ?? undefined} />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <p className="text-[13px] text-on-surface-variant">Select a stock to see why it moved.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-on-surface-variant">No source-backed moves right now.</p>
      )}
    </section>
  );
}

export type RecentEarningsCard = {
  ticker: string;
  eventDate: string;
  headline: string;
  epsTag?: string;
  leadCase: "bull" | "base" | "bear" | null;
  leadPct: number | null;
};

const EPS_TAG_LABEL: Record<string, string> = { beat: "Beat", miss: "Miss", inline: "In line" };
const EPS_TAG_COLOR: Record<string, string> = {
  beat: "var(--signal-bullish)",
  miss: "var(--signal-bearish)",
  inline: "var(--on-surface-variant)",
};
const SCENARIO_COLOR: Record<string, string> = {
  bull: "var(--signal-bullish)",
  base: "var(--on-surface-variant)",
  bear: "var(--signal-bearish)",
};

function RecentEarningsGrid({ items }: { items: RecentEarningsCard[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-[22px] font-semibold tracking-tight text-on-surface">Latest earnings</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const scenarioColor = item.leadCase ? SCENARIO_COLOR[item.leadCase] : "var(--on-surface-variant)";
          const epsColor = item.epsTag ? EPS_TAG_COLOR[item.epsTag] ?? "var(--on-surface-variant)" : undefined;
          return (
            <Link
              key={item.ticker}
              href={`/earnings-intel/${encodeURIComponent(item.ticker)}`}
              onClick={() => captureEvent("pulse_earnings_card_clicked", { ticker: item.ticker })}
              className="rounded-xl border border-outline-variant bg-surface p-4 hover:bg-surface-container-low"
            >
              <div className="flex items-center gap-3">
                <StockLogo ticker={item.ticker} market="US" size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-on-surface">{item.ticker}</p>
                  <p className="text-[12px] text-on-surface-variant">{dateLabel(item.eventDate)}</p>
                </div>
                {item.epsTag ? (
                  <span
                    className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                    style={{ color: epsColor, background: `color-mix(in srgb, ${epsColor} 12%, var(--surface))` }}
                  >
                    {EPS_TAG_LABEL[item.epsTag] ?? item.epsTag}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-on-surface">{item.headline}</p>
              {item.leadCase && item.leadPct != null ? (
                <p className="mt-3 text-[12.5px] font-medium capitalize" style={{ color: scenarioColor }}>
                  {item.leadCase} case leads · {Math.round(item.leadPct)}%
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
      <Link href="/earnings-intel" className="mt-4 inline-block text-[13px] font-medium text-primary">
        Read full earnings →
      </Link>
    </section>
  );
}

export function PulseHub({
  items,
  premarketMovers,
  premarketReport,
  isSubscribed = false,
  recentEarnings = [],
}: {
  items: ScannerItem[];
  premarketMovers?: PremarketMovers | null;
  premarketReport?: OpeningReport | null;
  isSubscribed?: boolean;
  recentEarnings?: RecentEarningsCard[];
}) {
  useEffect(() => {
    captureEvent("market_viewed", {
      mover_count: items.length,
      subscribed: isSubscribed,
      recent_earnings_count: recentEarnings.length,
    });
    // Fires once per mount to mark the page view; counts are a snapshot, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-8 pt-2">
      <PremarketStrip movers={premarketMovers ?? null} report={premarketReport ?? null} />
      <TodayMovers items={items} isSubscribed={isSubscribed} />
      <RecentEarningsGrid items={recentEarnings} />
    </div>
  );
}
