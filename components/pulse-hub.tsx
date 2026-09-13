"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { PriceChart } from "@/components/price-chart";
import { MarketStatusBanner } from "@/components/market-status";
import { RangeBar, RsiStrength } from "@/components/range-bar";
import { RedditBuzzCard } from "@/components/reddit-buzz-card";
import { confidenceLabel } from "@/lib/directive-ui";
import { StockLogo } from "@/components/stock-logo";
import { SquircleSurface } from "@/components/oa/squircle";
import { AnimatedIcon } from "@/components/animated-icon";
import type { ScannerItem } from "@/components/movers-scanner";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
} from "@/lib/product-analytics";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";
import { PRO_POINTS } from "@/lib/subscribe-benefits";
import { splitPulseMovers } from "@/lib/pulse-data";
import type {
  OpeningCue,
  OpeningReport,
  OpeningSession,
} from "@/lib/premarket-opening";
import type { PremarketMovers, PremarketRow } from "@/lib/premarket";
import type { RedditTicker } from "@/lib/reddit-cues-shared";

const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";
const H2 =
  "text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight";
const SUB = "mt-2 text-base leading-7 text-oa-muted-fg";
const EYEBROW = "text-base uppercase tracking-[0.12em] text-oa-muted-fg";

function money(v: number) {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span
      className="tabular-nums"
      style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
    >
      {up ? "+" : "\u2212"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
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

/* ── Pro checkout, same one-accent pattern as explore ───────────────────── */
function ProCheckoutButton({
  size = "md",
  className,
  children,
}: {
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    trackCheckoutClicked({
      period: "monthly",
      market: "US",
      signedIn: Boolean(user),
    });
    try {
      if (!user) await signInWithGoogle({ surface: "paywall" });
      const checkoutUrl = await startDodoCheckout();
      trackCheckoutStarted({ period: "monthly", market: "US" });
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void openCheckout()}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-oa-primary font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.12)] transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98] disabled:opacity-70 ${
        size === "sm" ? "h-9 px-4 text-base" : "h-11 px-6 text-base"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/* ── pre-market plate: the market in one breath ─────────────────────────── */
function SessionsTrend({ sessions }: { sessions: OpeningSession[] }) {
  const rows = sessions.slice(-5);
  if (rows.length === 0) return null;
  const maxAbs = Math.max(1, ...rows.map((s) => Math.abs(s.change_pct)));
  const latest = rows[rows.length - 1];
  const latestColor =
    latest.change_pct >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return (
    <div className="shrink-0 rounded-[18px] border border-oa-border bg-oa-card p-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[16px] text-oa-muted-fg">
          Last {rows.length} sessions
        </p>
        <span
          className="text-[17px] font-medium tabular-nums"
          style={{ color: latestColor }}
        >
          {latest.change_pct >= 0 ? "+" : ""}
          {latest.change_pct.toFixed(1)}%
        </span>
      </div>
      <div className="mt-2 flex h-8 items-end gap-1">
        {rows.map((s) => {
          const up = s.change_pct >= 0;
          const color = up ? "var(--signal-bullish)" : "var(--signal-bearish)";
          const barHeightPct = Math.max(
            15,
            (Math.abs(s.change_pct) / maxAbs) * 100,
          );
          return (
            <div
              key={s.date}
              title={`${dateLabel(s.date) ?? ""} ${up ? "+" : ""}${s.change_pct.toFixed(1)}%`}
              className="flex h-full w-4 items-end"
            >
              <div
                className="w-full rounded-t"
                style={{ height: `${barHeightPct}%`, background: color }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FuturesRow({ cues }: { cues: OpeningCue[] }) {
  const futures = cues.filter((c) => c.group === "futures").slice(0, 3);
  if (futures.length === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {futures.map((cue) => (
        <span
          key={cue.id}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-oa-border bg-oa-card px-3 py-1.5 text-[14px]"
        >
          <span className="font-medium text-oa-fg">{cue.label}</span>
          {pctLabel(cue.change_pct)}
        </span>
      ))}
    </div>
  );
}

function OpensPlate({
  movers,
  report,
}: {
  movers: PremarketMovers | null;
  report: OpeningReport | null;
}) {
  if (!movers && !report) return null;
  const label = dateLabel(movers?.date || report?.generated_at);
  const color =
    TONE_COLOR[report?.direction ?? "neutral"] ?? TONE_COLOR.neutral;

  return (
    <section aria-label="Pre-market setup">
      <div className="mb-4 max-w-2xl">
        <h2 className={H2}>How today opens</h2>
        <p className={SUB}>Futures and the sessions leading into the bell.</p>
      </div>
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <SquircleSurface className="rounded-[22px] border border-oa-border bg-oa-bg px-4 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:px-8 sm:py-8 sm:[--card-clip-radius:17px]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className={EYEBROW}>Pre-market{label ? ` · ${label}` : ""}</p>
              {report ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2.5">
                    <span
                      className="text-[56px] font-medium leading-none tabular-nums tracking-tight sm:text-[72px]"
                      style={{ color }}
                    >
                      {Math.round(report.score)}
                    </span>
                    <span className="text-[14px] text-oa-muted-fg">/100</span>
                  </div>
                  <p
                    className="mt-1.5 text-[14px] font-medium"
                    style={{ color }}
                  >
                    {report.label}
                  </p>
                </>
              ) : null}
            </div>
            {report?.sessions?.length ? (
              <SessionsTrend sessions={report.sessions} />
            ) : null}
          </div>
          {report?.global_cues?.length ? (
            <FuturesRow cues={report.global_cues} />
          ) : null}
        </SquircleSurface>
      </SquircleSurface>
    </section>
  );
}

/* ── where the market leans: sector heat + gappers ──────────────────────── */
// Only these buckets are worth a tile; everything else is noise for a
// "what's moving" heatmap. All Consumer* GICS sectors collapse into one.
const SECTOR_BUCKET: Record<string, string> = {
  technology: "Tech",
  "information technology": "IT",
  energy: "Energy",
  materials: "Materials",
  "health care": "Healthcare",
  healthcare: "Healthcare",
  "consumer staples": "Consumers",
  "consumer discretionary": "Consumers",
  "consumer cyclical": "Consumers",
  "consumer defensive": "Consumers",
};

function SectorPulse({ movers }: { movers: PremarketMovers }) {
  const rows = [...(movers.gappers_up ?? []), ...(movers.gappers_down ?? [])];
  const bySector = new Map<
    string,
    { sum: number; count: number; tickers: { ticker: string; pct: number }[] }
  >();
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
      topTickers: [...tickers]
        .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
        .slice(0, 4),
    }))
    .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg));
  if (ranked.length === 0) return null;
  const maxAbs = Math.max(1, ...ranked.map((s) => Math.abs(s.avg)));
  const COLS = 4;
  // The first 3 tiles form a fixed 2x2 + two 2x1 block that exactly fills two
  // full rows. Everything after that is 1x1 - except the first tile of the
  // final partial row, which stretches to swallow whatever's left over so
  // the grid always ends flush.
  const smallCount = Math.max(0, ranked.length - 3);
  const remainder = smallCount % COLS;
  const fillIndex = ranked.length - remainder;
  // Tailwind's JIT only picks up literal class strings, so the fill span for
  // the trailing tile is looked up rather than interpolated.
  const FILL_SPAN_CLASS: Record<number, string> = {
    2: "col-span-2",
    3: "col-span-3",
    4: "col-span-4",
  };
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
    <div className="grid grid-cols-4 gap-1.5 [grid-auto-rows:4.5rem]">
      {ranked.map((s, i) => {
        const up = s.avg >= 0;
        const tone = up ? "var(--signal-bullish)" : "var(--signal-bearish)";
        const intensity = Math.min(1, Math.abs(s.avg) / maxAbs);
        // Only stocks actually moving in this sector; no static padding.
        const logoTickers = [...new Set(s.topTickers.map((t) => t.ticker))].slice(0, 3);
        return (
          <div
            key={s.sector}
            className={`flex flex-col justify-between rounded-[14px] px-3 py-2.5 ${spanClass(i)}`}
            style={{
              background: `color-mix(in srgb, ${tone} ${8 + intensity * 22}%, var(--oa-card))`,
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[15px] font-medium text-oa-muted-fg">
                {s.sector}
              </p>
              <div className="flex shrink-0 -space-x-2">
                {logoTickers.map((ticker) => (
                  <span
                    key={ticker}
                    className="overflow-hidden rounded-full ring-2 ring-oa-card"
                  >
                    <StockLogo ticker={ticker} market="US" size={22} circle />
                  </span>
                ))}
              </div>
            </div>
            <p
              className="text-[16px] font-medium tabular-nums"
              style={{ color: tone }}
            >
              {up ? "+" : ""}
              {s.avg.toFixed(1)}%
            </p>
          </div>
        );
      })}
    </div>
  );
}

function GapperStrip({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: "up" | "down";
  rows: PremarketRow[];
}) {
  if (rows.length === 0) return null;
  const color =
    tone === "up" ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return (
    <div>
      <p className="text-[16px] font-medium" style={{ color }}>
        {title}
      </p>
      <div className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rows.map((row) => (
          <Link
            key={row.instrument_id}
            href={`/stock/${row.ticker}`}
            onClick={() =>
              captureEvent("pulse_gapper_clicked", { ticker: row.ticker })
            }
            className="group shrink-0 outline-none"
          >
            <div className="w-40 rounded-[18px] border border-oa-border bg-oa-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-oa-accent/60 group-focus-visible:bg-oa-accent/60 sm:w-44">
              <div className="flex items-center gap-2">
                <StockLogo ticker={row.ticker} market="US" size={24} circle />
                <p className="min-w-0 truncate text-[16px] font-medium text-oa-fg">
                  {row.ticker}
                </p>
              </div>
              <p className="mt-2.5 text-[16px] font-medium tabular-nums leading-none tracking-tight text-oa-fg">
                ${money(row.pre_market_price)}
              </p>
              <p className="mt-1.5 text-[15px] font-medium">
                {pctLabel(row.pre_market_change_pct)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LeaningPlate({ movers }: { movers: PremarketMovers | null }) {
  if (!movers) return null;
  const gappersUp = [...(movers.gappers_up ?? [])]
    .sort((a, b) => b.pre_market_change_pct - a.pre_market_change_pct)
    .slice(0, 15);
  const gappersDown = [...(movers.gappers_down ?? [])]
    .sort((a, b) => a.pre_market_change_pct - b.pre_market_change_pct)
    .slice(0, 15);
  if (gappersUp.length === 0 && gappersDown.length === 0) return null;

  return (
    <section aria-label="Sector heat and pre-market gappers">
      <div className="mb-4 max-w-2xl">
        <h2 className={H2}>Where the market leans</h2>
        <p className={SUB}>Sector heat and the names moving before the open.</p>
      </div>
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <SquircleSurface className="rounded-[22px] border border-oa-border bg-oa-bg px-4 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:px-8 sm:py-8 sm:[--card-clip-radius:17px]">
          <SectorPulse movers={movers} />
          <div className="mt-6 space-y-5">
            <GapperStrip title="Gapping up" tone="up" rows={gappersUp} />
            <GapperStrip title="Gapping down" tone="down" rows={gappersDown} />
          </div>
        </SquircleSurface>
      </SquircleSurface>
    </section>
  );
}

/* ── movers: master-detail board with the reason in every row ───────────── */
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
    fetch(
      `/api/pulse-stock-chart?instrument_id=${encodeURIComponent(instrumentId)}`,
    )
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setData(Array.isArray(body?.data) ? body.data : []);
        setExtras({
          week52High:
            typeof body?.week52High === "number" ? body.week52High : null,
          week52Low:
            typeof body?.week52Low === "number" ? body.week52Low : null,
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

function MoverRow({
  item,
  active,
  onSelect,
}: {
  item: ScannerItem;
  active: boolean;
  onSelect: () => void;
}) {
  const reason = moverReason(item);

  return (
    <Link
      href={`/stock/${item.ticker}`}
      onClick={(e) => {
        captureEvent("pulse_mover_selected", { ticker: item.ticker });
        // Desktop keeps the inline master-detail pane; mobile navigates
        // straight to the stock page.
        if (window.matchMedia("(min-width: 768px)").matches) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex w-full items-start gap-2.5 px-3 py-4 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent sm:items-center sm:gap-3.5 sm:px-5 ${
        active ? "bg-oa-accent" : ""
      }`}
      aria-current={active ? "true" : undefined}
    >
      <StockLogo
        ticker={item.ticker}
        market="US"
        size={32}
        circle
        className="shrink-0 mt-0.5 sm:mt-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium leading-5 text-oa-fg">
          {item.ticker}
        </p>
        {item.company ? (
          <p className="hidden text-[16px] leading-4 text-oa-muted-fg sm:block">
            {item.company}
          </p>
        ) : null}
        {reason ? (
          <p className="text-[15px] leading-5 text-oa-muted-fg break-words md:hidden">
            {reason}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="text-[15px] font-medium tabular-nums leading-5 text-oa-fg">
          ${money(item.price)}
        </span>
        <span className="text-[15px] font-medium leading-5">
          {pctLabel(item.changePct)}
        </span>
      </div>
    </Link>
  );
}

function moverReason(item: ScannerItem) {
  return (item.headline || item.whyItMatters || item.tag || "").trim();
}

function DetailStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[16px] leading-4 text-oa-muted-fg">{label}</p>
      <div className="mt-0.5 text-base font-medium tabular-nums text-oa-fg">
        {children}
      </div>
    </div>
  );
}

function MoversBoard({
  items,
}: {
  items: ScannerItem[];
}) {
  const [tab, setTab] = useState<"gainers" | "losers">("gainers");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const { gainers: winners, losers } = splitPulseMovers(items);
  const rows = tab === "gainers" ? winners : losers;
  const visibleRows = rows;

  const selectedIndex = rows.findIndex((r) => r.ticker === selectedTicker);
  const selected =
    selectedIndex >= 0 ? rows[selectedIndex] : (visibleRows[0] ?? null);
  const selectedReason = selected ? moverReason(selected) : "";
  const {
    data: chartData,
    extras: chartExtras,
    loading: chartLoading,
  } = useStockChart(selected?.instrument_id);

  function selectTab(key: "gainers" | "losers") {
    setTab(key);
    setSelectedTicker(null);
    captureEvent("pulse_movers_tab_selected", { tab: key });
  }

  const hasMovers = winners.length > 0 || losers.length > 0;

  return (
    <section aria-label="Today's movers">
      <div className="mb-4 max-w-2xl">
        <h2 className={H2}>Why these stocks are moving</h2>
        <p className={SUB}>
          Every big move with the reason behind it. Rescanned through the day.
        </p>
      </div>

      {hasMovers ? (
        <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <SquircleSurface className="overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
            <div className="md:grid md:grid-cols-[22rem_1fr] lg:grid-cols-[26rem_1fr]">
              <div className="min-w-0 md:border-r md:border-oa-border">
                <div className="flex gap-2 px-3 pb-3 pt-4 sm:px-5">
                  {(
                    [
                      [
                        "gainers",
                        "Gainers",
                        "trending-up",
                        "var(--signal-bullish)",
                      ],
                      [
                        "losers",
                        "Losers",
                        "trending-down",
                        "var(--signal-bearish)",
                      ],
                    ] as const
                  ).map(([key, tabLabel, iconName, iconColor]) => {
                    const active = tab === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => selectTab(key)}
                        className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-base font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${
                          active
                            ? "border-transparent text-oa-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                            : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                        }`}
                        style={
                          active
                            ? {
                                background:
                                  "color-mix(in srgb, var(--oa-primary) 12%, var(--oa-card))",
                                borderColor:
                                  "color-mix(in srgb, var(--oa-primary) 40%, transparent)",
                              }
                            : undefined
                        }
                      >
                        <AnimatedIcon
                          name={iconName}
                          size={15}
                          style={{ color: iconColor }}
                          aria-hidden
                        />
                        {tabLabel}
                      </button>
                    );
                  })}
                </div>

                {rows.length === 0 ? (
                  <p className="px-3 pb-6 text-base text-oa-muted-fg sm:px-5">
                    No {tab === "gainers" ? "gainers" : "losers"} right now.
                  </p>
                ) : (
                  <>
                    <div className="max-h-[38rem] overflow-y-auto">
                      <AnimatePresence initial={false} mode="wait">
                        <motion.div
                          key={tab}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                          className="divide-y divide-oa-border/60"
                        >
                          {visibleRows.map((row) => (
                            <MoverRow
                              key={row.ticker}
                              item={row}
                              active={selected?.ticker === row.ticker}
                              onSelect={() => setSelectedTicker(row.ticker)}
                            />
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <div className="h-2" />
                  </>
                )}
              </div>

              <div className="hidden min-w-0 p-4 md:block md:min-h-[38rem] sm:p-6">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <StockLogo
                        ticker={selected.ticker}
                        market="US"
                        size={40}
                        circle
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-medium tracking-tight text-oa-fg">
                          {selected.ticker}
                          {selected.company ? ` · ${selected.company}` : ""}
                        </p>
                        <p className="text-[15px] font-medium">
                          ${money(selected.price)} ·{" "}
                          {pctLabel(selected.changePct)}
                        </p>
                      </div>
                      <Link
                        href={`/stock/${selected.ticker}`}
                        onClick={() =>
                          captureEvent("pulse_mover_open_stock_page", {
                            ticker: selected.ticker,
                            tab,
                          })
                        }
                        className="shrink-0 rounded-full border border-oa-border px-3.5 py-1.5 text-[16px] font-medium text-oa-fg transition-colors hover:bg-oa-accent"
                      >
                        Open stock page ›
                      </Link>
                    </div>

                    {selected.overallLabel && selected.overallScore != null ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className="rounded-full px-2.5 py-1 text-base font-medium capitalize"
                          style={{
                            color:
                              selected.overallLabel === "bullish"
                                ? "var(--signal-bullish)"
                                : selected.overallLabel === "bearish"
                                  ? "var(--signal-bearish)"
                                  : "var(--oa-muted-fg)",
                            background:
                              "color-mix(in srgb, currentColor 10%, transparent)",
                          }}
                        >
                          {selected.overallLabel} ·{" "}
                          {Math.round(selected.overallScore)}/100
                        </span>
                        {selected.tag && selected.tag !== "--" ? (
                          <span className="rounded-full bg-oa-secondary px-2.5 py-1 text-base font-medium text-oa-muted-fg">
                            {selected.tag}
                          </span>
                        ) : null}
                        {selected.confidence ? (
                          <span className="rounded-full bg-oa-secondary px-2.5 py-1 text-base font-medium text-oa-muted-fg">
                            {confidenceLabel(selected.confidence) ?? selected.confidence}
                          </span>
                        ) : null}
                        {selected.buzz ? (
                          <span className="rounded-full bg-oa-secondary px-2.5 py-1 text-base font-medium capitalize text-oa-muted-fg">
                            Reddit: {selected.buzz}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4 overflow-hidden rounded-[14px] border border-oa-border bg-oa-card">
                      {chartLoading ? (
                        <div className="h-[180px] animate-pulse bg-oa-secondary" />
                      ) : chartData.length > 1 ? (
                        <PriceChart
                          data={chartData}
                          currency="$"
                          embedded
                          currentPrice={selected.price}
                          height={180}
                        />
                      ) : (
                        <div className="flex h-[100px] items-center justify-center text-[16px] text-oa-muted-fg">
                          No chart data available
                        </div>
                      )}
                    </div>

                    {selectedReason &&
                    selectedReason !== selected.whyItMatters?.trim() ? (
                      <p className="mt-4 text-[16px] font-medium leading-7 text-oa-muted-fg">
                        {selectedReason}
                      </p>
                    ) : null}

                    {selected.whyItMatters ? (
                      <p className="mt-3 text-[16px] leading-7 text-oa-muted-fg">
                        {selected.whyItMatters}
                      </p>
                    ) : null}

                    {chartLoading ? (
                      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-oa-border pt-4 sm:grid-cols-2">
                        {[0, 1].map((col) => (
                          <div key={col} className="animate-pulse space-y-2.5">
                            <div className="h-3 w-24 rounded-full bg-oa-secondary" />
                            <div className="h-8 w-full rounded-full bg-oa-secondary" />
                          </div>
                        ))}
                      </div>
                    ) : chartExtras &&
                      (Number.isFinite(chartExtras.week52High) ||
                        Number.isFinite(chartExtras.rsi14)) ? (
                      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-oa-border pt-4 sm:grid-cols-2">
                        {Number.isFinite(chartExtras.week52High) &&
                        Number.isFinite(chartExtras.week52Low) ? (
                          <RangeBar
                            label="52-week range"
                            low={chartExtras.week52Low!}
                            high={chartExtras.week52High!}
                            current={selected.price}
                            format={(v) => `$${money(v)}`}
                          />
                        ) : null}
                        {Number.isFinite(chartExtras.rsi14) ? (
                          <RsiStrength
                            value={chartExtras.rsi14!}
                            state={chartExtras.rsiState ?? undefined}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[16px] text-oa-muted-fg">
                    Select a stock to see why it moved.
                  </p>
                )}
              </div>
            </div>
          </SquircleSurface>
        </SquircleSurface>
      ) : (
        <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="rounded-[22px] border border-oa-border bg-oa-bg px-5 py-10 text-center sm:rounded-[44px]">
            <p className="text-[17px] text-oa-muted-fg">
              <span className="font-medium text-oa-fg">Warming up.</span> Movers
              land here as the market opens.
            </p>
          </div>
        </SquircleSurface>
      )}
    </section>
  );
}

function RedditBuzzPlate({
  tickers,
  postCount,
}: {
  tickers: RedditTicker[];
  postCount?: number;
}) {
  if (tickers.length === 0) return null;

  return (
    <section aria-label="Reddit buzz">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className={H2}>Reddit buzz</h2>
          <p className={SUB}>
            The names getting attention right now, with the context behind the
            chatter.
          </p>
          {typeof postCount === "number" && postCount > 0 ? (
            <p className="mt-2 text-[13px] text-oa-muted-fg">
              {postCount} posts scanned
            </p>
          ) : null}
        </div>
        <Link
          href="/reddit-buzz"
          className="group flex items-center gap-1 rounded-full px-2 py-1 text-base font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        >
          See all
          <span
            aria-hidden="true"
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          >
            ›
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tickers.map((item) => (
          <RedditBuzzCard
            key={item.ticker}
            item={item}
            variant="pulse"
            showStockLink={false}
            showTalkingPoints={false}
          />
        ))}
      </div>
    </section>
  );
}

/* ── earnings ───────────────────────────────────────────────────────────── */
export type RecentEarningsCard = {
  ticker: string;
  eventDate: string;
  headline: string;
  epsTag?: string;
  leadCase: "bull" | "base" | "bear" | null;
  leadPct: number | null;
};

const EPS_TAG_LABEL: Record<string, string> = {
  beat: "Beat",
  miss: "Miss",
  inline: "In line",
};
const EPS_TAG_COLOR: Record<string, string> = {
  beat: "var(--signal-bullish)",
  miss: "var(--signal-bearish)",
  inline: "var(--oa-muted-fg)",
};
const SCENARIO_COLOR: Record<string, string> = {
  bull: "var(--signal-bullish)",
  base: "var(--oa-muted-fg)",
  bear: "var(--signal-bearish)",
};

function EarningsCard({ item }: { item: RecentEarningsCard }) {
  const epsColor = item.epsTag
    ? (EPS_TAG_COLOR[item.epsTag] ?? "var(--oa-muted-fg)")
    : undefined;
  const scenarioColor = item.leadCase
    ? SCENARIO_COLOR[item.leadCase]
    : "var(--oa-muted-fg)";

  return (
    <Link
      href={`/earnings-intel/${encodeURIComponent(item.ticker)}`}
      onClick={() =>
        captureEvent("pulse_earnings_card_clicked", { ticker: item.ticker })
      }
      className="group outline-none"
    >
      <SquircleSurface className="h-full border border-oa-border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-oa-accent/60 group-focus-visible:bg-oa-accent/60">
        <div className="flex items-center gap-3">
          <StockLogo ticker={item.ticker} market="US" size={32} circle />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-medium text-oa-fg">{item.ticker}</p>
            <p className="text-base text-oa-muted-fg">
              {dateLabel(item.eventDate)}
            </p>
          </div>
          {item.epsTag ? (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-base font-medium"
              style={{
                color: epsColor,
                background: `color-mix(in srgb, ${epsColor} 10%, transparent)`,
              }}
            >
              {EPS_TAG_LABEL[item.epsTag] ?? item.epsTag}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[16px] leading-6 text-oa-fg/80">
          {item.headline}
        </p>
        {item.leadCase && item.leadPct != null ? (
          <p
            className="mt-3 text-[16px] font-medium capitalize"
            style={{ color: scenarioColor }}
          >
            {item.leadCase} case leads · {Math.round(item.leadPct)}%
          </p>
        ) : null}
      </SquircleSurface>
    </Link>
  );
}

function EarningsPlate({ items }: { items: RecentEarningsCard[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-label="Latest earnings">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className={H2}>What earnings just changed</h2>
          <p className={SUB}>
            The latest reports and the market&rsquo;s read on each.
          </p>
        </div>
        <Link
          href="/earnings-intel"
          className="group flex items-center gap-1 rounded-full px-2 py-1 text-base font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        >
          All earnings
          <span
            aria-hidden="true"
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          >
            ›
          </span>
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <EarningsCard key={item.ticker} item={item} />
        ))}
      </div>
    </section>
  );
}

/* ── the Pro plate: value stack, anchor price, risk reversal ────────────── */
function ProPlate() {
  return (
    <SquircleSurface className="bg-oa-bg shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="px-6 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl">
            Pro tells you what to do about what just moved.
          </h2>
        </div>
        <ul className="mx-auto mt-10 grid max-w-3xl gap-x-8 gap-y-8 sm:grid-cols-2">
          {PRO_POINTS.map((point) => (
            <li key={point.icon} className="flex items-start gap-3.5">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-oa-card text-oa-fg/70 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [&_svg]:size-[18px]"
              >
                <AnimatedIcon name={point.icon} size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-medium leading-6 text-oa-fg">
                  {point.title}
                </span>
                <span className="mt-0.5 block text-[16px] leading-6 text-oa-muted-fg">
                  {point.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <ProCheckoutButton className="h-11 w-full px-6 text-base sm:w-auto">
            Try Pro
          </ProCheckoutButton>
          <p className="text-center text-[17px] leading-6 text-oa-muted-fg sm:text-left">
            <span className="font-medium tabular-nums text-oa-fg">
              ${US_PRO_MONTHLY}/mo
            </span>{" "}
            · 3-day full trial · cancel anytime
          </p>
        </div>
      </div>
    </SquircleSurface>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */
export function PulseHub({
  nowIso,
  items,
  premarketMovers,
  premarketReport,
  isSubscribed = false,
  recentEarnings = [],
  redditTickers = [],
  redditPostCount,
}: {
  nowIso: string;
  items: ScannerItem[];
  premarketMovers?: PremarketMovers | null;
  premarketReport?: OpeningReport | null;
  isSubscribed?: boolean;
  recentEarnings?: RecentEarningsCard[];
  redditTickers?: RedditTicker[];
  redditPostCount?: number;
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
    <div
      className={`mx-auto w-full max-w-[76rem] flex flex-col gap-12 px-0 py-8 sm:gap-16 sm:px-6 sm:py-12`}
    >
      <MarketStatusBanner nowIso={nowIso} surface="pulse" />
      <OpensPlate
        movers={premarketMovers ?? null}
        report={premarketReport ?? null}
      />
      <LeaningPlate movers={premarketMovers ?? null} />
      <MoversBoard items={items} />
      <RedditBuzzPlate tickers={redditTickers} postCount={redditPostCount} />
      <EarningsPlate items={recentEarnings} />

      {!isSubscribed ? <ProPlate /> : null}
    </div>
  );
}
