"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { StockLogo } from "@/components/stock-logo";
import { OaButton } from "@/components/oa/button";
import { SquircleSurface } from "@/components/oa/squircle";
import { TrackButton } from "@/components/track-button";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { captureEvent } from "@/lib/posthog";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
} from "@/lib/product-analytics";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { useUser } from "@/lib/auth-context";
import type { HeatRow } from "@/lib/heat";
import type { Near52WeekRow } from "@/lib/near-52-week";
import { formatTrumpLogicDate } from "@/lib/trump-logic-format";
import { US_PRO_MONTHLY, US_PRO_YEARLY } from "@/lib/pricing";
import { PRO_POINTS } from "@/lib/subscribe-benefits";
import { AnimatedIcon } from "@/components/animated-icon";
import {
  AiCapexSection,
  type AiCapexRow,
  type AiCapexWatchRow,
} from "@/components/oa/ai-capex-section";

/* ── springs (oa-design: one spring family) ────────────────────────────── */
const LAYOUT = { type: "spring", stiffness: 550, damping: 40 } as const;

const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";

/* How many rows each scan shows before the Pro gate. Trump stays tighter:
   his mentions are the scarcest edge on the page. */
const FREE_ROWS = 5;
const TRUMP_FREE_ROWS = 3;

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

type Pill = { text: string; color: string };

export type ScreenerRow = {
  key: string;
  ticker: string;
  instrumentId: string;
  name: string;
  price?: number;
  changePct?: number;
  pills: Pill[];
  detail?: string;
};

export type TrumpMentionRow = {
  ticker: string;
  name: string;
  price?: number;
  changePct?: number;
  sentiment: string;
  latestSaid: string;
  latestPublishedAt: string;
  mentionCount: number;
};

// Mirrors heat-list.tsx's extractCatalystHint: pulls the specific "why" out of
// the reason sentence instead of showing the generic driver label.
function extractCatalystHint(
  sentence: string | undefined,
  ticker: string,
): string | null {
  if (!sentence) return null;
  const trimmed = sentence.split(";")[0].trim();
  const withoutPrefix = trimmed.replace(
    new RegExp(`^${ticker}\\s+has\\s+`, "i"),
    "",
  );
  return withoutPrefix || null;
}

function rowsFromNear52(
  rows: Near52WeekRow[],
  kind: "high" | "low",
): ScreenerRow[] {
  return rows.map((r) => {
    const pill =
      kind === "high"
        ? r.pctFromHigh >= 0
          ? {
              text: `${r.pctFromHigh.toFixed(1)}% above`,
              color: "var(--signal-bullish)",
            }
          : {
              text: `${Math.abs(r.pctFromHigh).toFixed(1)}% below`,
              color: "var(--primary)",
            }
        : r.pctFromLow <= 0
          ? {
              text: `${Math.abs(r.pctFromLow).toFixed(1)}% below`,
              color: "var(--signal-bearish)",
            }
          : {
              text: `${r.pctFromLow.toFixed(1)}% above`,
              color: "var(--primary)",
            };
    return {
      key: r.ticker,
      ticker: r.ticker,
      instrumentId: `US_${r.ticker}`,
      name: r.name,
      price: r.price,
      changePct: r.changePct,
      pills: [pill],
    };
  });
}

function rowsFromHeat(
  rows: HeatRow[],
  kind: "hot" | "momentum" | "news_spike" | "catalyst" | "dip",
): ScreenerRow[] {
  return rows.map((r) => {
    const pills: Pill[] = [];
    if (kind === "news_spike" && r.multiplier > 0) {
      pills.push({
        text: `${r.multiplier.toFixed(1)}x mentions`,
        color: "var(--primary)",
      });
    }
    if (kind === "momentum" && typeof r.momentum_score === "number") {
      pills.push({
        text: `${Math.round(r.momentum_score)}`,
        color: "var(--primary)",
      });
    }
    if (kind === "catalyst") {
      const hint =
        extractCatalystHint(r.reason_sentence, r.ticker) ?? r.primary_driver;
      if (hint)
        pills.push({
          text: hint.length > 70 ? `${hint.slice(0, 70).trim()}…` : hint,
          color: "var(--primary)",
        });
    }
    if (kind === "dip" && typeof r.rsi_14 === "number") {
      pills.push({
        text: `RSI ${Math.round(r.rsi_14)} oversold`,
        color: "var(--signal-bullish)",
      });
    }
    if (kind !== "catalyst" && kind !== "dip" && r.heat_direction) {
      pills.push({
        text: r.heat_direction[0].toUpperCase() + r.heat_direction.slice(1),
        color:
          r.heat_direction === "bullish"
            ? "var(--signal-bullish)"
            : r.heat_direction === "caution"
              ? "var(--signal-bearish)"
              : "var(--on-surface-variant)",
      });
    }
    if (r.risk_level)
      pills.push({
        text: `${r.risk_level} risk`,
        color: "var(--on-surface-variant)",
      });
    return {
      key: r.instrument_id,
      ticker: r.ticker,
      instrumentId: r.instrument_id,
      name: r.name,
      price: r.price ?? undefined,
      changePct: r.day_change_pct ?? undefined,
      pills: pills.slice(0, 2),
    };
  });
}

function rowsFromTrump(rows: TrumpMentionRow[]): ScreenerRow[] {
  return rows.map((row) => {
    const sentiment = row.sentiment.toLowerCase();
    const sentimentColor =
      sentiment === "bullish"
        ? "var(--signal-bullish)"
        : sentiment === "bearish"
          ? "var(--signal-bearish)"
          : "var(--on-surface-variant)";
    const date = formatTrumpLogicDate(row.latestPublishedAt);
    return {
      key: `trump-${row.ticker}`,
      ticker: row.ticker,
      instrumentId: `US_${row.ticker}`,
      name: row.name,
      price: row.price,
      changePct: row.changePct,
      detail: row.latestSaid,
      pills: [
        {
          text: sentiment
            ? sentiment[0].toUpperCase() + sentiment.slice(1)
            : "Neutral",
          color: sentimentColor,
        },
        {
          text: `${date} · ${row.mentionCount} mention${row.mentionCount === 1 ? "" : "s"}`,
          color: "var(--on-surface-variant)",
        },
      ],
    };
  });
}

/* Each scan leads with its outcome, not its mechanics. */
const SCANS: {
  key: string;
  label: string;
  blurb: string;
}[] = [
  {
    key: "hot",
    label: "Hot stocks",
    blurb: "The highest heat in the market right now.",
  },
  {
    key: "momentum",
    label: "Momentum",
    blurb: "Accelerating today. Early enough to act.",
  },
  {
    key: "near_high",
    label: "52-week high",
    blurb: "Pressing into new highs. Strength keeps going.",
  },
  {
    key: "near_low",
    label: "52-week low",
    blurb: "Falling knife or coiled spring?",
  },
  {
    key: "news_spike",
    label: "News spikes",
    blurb: "Mentions far above normal. Not priced in yet.",
  },
  {
    key: "catalyst",
    label: "Catalysts",
    blurb: "A dated reason for the move.",
  },
  { key: "dip", label: "Oversold", blurb: "RSI lows, where bounces are born." },
  {
    key: "trump",
    label: "Trump mentions",
    blurb: "When he talks, tickers move.",
  },
];

/* ── Pro checkout, styled by the OA system (one accent, spent once) ─────── */
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
    <OaButton
      size={size}
      className={className}
      onClick={() => void openCheckout()}
      loading={busy}
    >
      {children}
    </OaButton>
  );
}

/* ── trending strip ─────────────────────────────────────────────────────── */
type TrendingStock = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

function TrendingStrip({ stocks }: { stocks: TrendingStock[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  if (stocks.length === 0) return null;

  return (
    <section aria-label="Top traded stocks">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-medium tracking-tight text-oa-fg">
            Top traded right now
          </h2>
          <p className="mt-1 text-[16.5px] text-oa-muted-fg">
            Where most of the money already is.
          </p>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {stocks.map((stock) => {
          const up = stock.changePct >= 0;
          return (
            <Link
              key={stock.ticker}
              href={`/stock/${stock.ticker}`}
              onClick={() =>
                captureEvent("explore_stock_clicked", {
                  ticker: stock.ticker,
                  section: "trending_now",
                })
              }
              className="group shrink-0 outline-none"
            >
              <SquircleSurface className="w-44 border border-oa-border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-oa-accent/60 group-focus-visible:bg-oa-accent/60">
                <div className="flex items-center gap-2">
                  <StockLogo
                    ticker={stock.ticker}
                    market="US"
                    size={24}
                    circle
                  />
                  <p className="min-w-0 truncate text-base font-medium text-oa-fg">
                    {stock.ticker}
                  </p>
                </div>
                <p className="mt-2.5 text-xl font-medium tabular-nums leading-none tracking-tight text-oa-fg">
                  ${money(stock.price)}
                </p>
                <p className="mt-1.5 text-[15px] font-medium">
                  {pctLabel(stock.changePct)}
                </p>
              </SquircleSurface>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── screener row ───────────────────────────────────────────────────────── */
function ScanRow({
  row,
  category,
  isSubscribed,
  isTracked,
  trackedIds,
  trackedCount,
}: {
  row: ScreenerRow;
  category: string;
  isSubscribed?: boolean;
  isTracked?: boolean;
  trackedIds?: string[];
  trackedCount?: number;
}) {
  return (
    <div className="group flex items-start gap-2 px-3 py-3 transition-colors hover:bg-oa-accent focus-within:bg-oa-accent sm:gap-3.5 sm:px-5">
      <div className="flex min-w-0 w-20 shrink-0 items-start gap-2 sm:w-44 sm:gap-3.5">
        <Link
          href={`/stock/${row.ticker}`}
          onClick={() =>
            captureEvent("explore_stock_clicked", {
              ticker: row.ticker,
              section: "screener",
              category,
            })
          }
          className="shrink-0 outline-none"
        >
          <StockLogo ticker={row.ticker} market="US" size={32} circle />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/stock/${row.ticker}`}
              onClick={() =>
                captureEvent("explore_stock_clicked", {
                  ticker: row.ticker,
                  section: "screener",
                  category,
                })
              }
              className="text-lg font-medium leading-6 text-oa-fg outline-none"
            >
              {row.ticker}
            </Link>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <TrackButton
                ticker={row.ticker}
                instrumentId={row.instrumentId}
                tier={resolveStockTier(row.instrumentId, trackedIds ?? [])}
                isSubscribed={isSubscribed}
                isTracked={
                  isTracked ?? Boolean(trackedIds?.includes(row.instrumentId))
                }
                trackedCount={trackedCount}
                variant="icon"
              />
            </span>
          </div>
          {row.name ? (
            <Link
              href={`/stock/${row.ticker}`}
              onClick={() =>
                captureEvent("explore_stock_clicked", {
                  ticker: row.ticker,
                  section: "screener",
                  category,
                })
              }
              className="mt-0.5 block truncate text-[14.5px] leading-6 text-oa-muted-fg outline-none"
            >
              {row.name}
            </Link>
          ) : null}
        </div>
      </div>
      <Link
        href={`/stock/${row.ticker}`}
        onClick={() =>
          captureEvent("explore_stock_clicked", {
            ticker: row.ticker,
            section: "screener",
            category,
          })
        }
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 outline-none"
      >
        {row.pills.map((pill) => (
          <span
            key={pill.text}
            className="max-w-full break-words rounded-full border border-oa-border bg-oa-card px-3 py-1 text-[12px] font-medium leading-6"
            style={{ color: pill.color }}
          >
            {pill.text}
          </span>
        ))}
        {row.detail ? (
          <p className="w-full text-[14.5px] leading-6 text-oa-muted-fg">
            &ldquo;{row.detail}&rdquo;
          </p>
        ) : null}
      </Link>
      <Link
        href={`/stock/${row.ticker}`}
        onClick={() =>
          captureEvent("explore_stock_clicked", {
            ticker: row.ticker,
            section: "screener",
            category,
          })
        }
        className="flex shrink-0 flex-col items-end outline-none"
      >
        {typeof row.price === "number" ? (
          <span className="text-[17px] font-medium tabular-nums leading-6 text-oa-fg">
            ${money(row.price)}
          </span>
        ) : null}
        {typeof row.changePct === "number" ? (
          <span className="text-[15px] font-medium leading-6">
            {pctLabel(row.changePct)}
          </span>
        ) : null}
      </Link>
    </div>
  );
}

/* The gate: real value above, honest curiosity below. */
function GateStrip({ hiddenCount }: { hiddenCount: number }) {
  return (
    <div className="relative">
      {/* blurred preview of the locked rows: show there's more, hide the answer */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none overflow-hidden opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
      >
        <ScanRowGhost />
        <ScanRowGhost />
      </div>
      <div
        role="status"
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-3 pb-4 pt-10 text-center sm:flex-row sm:justify-between sm:px-5 sm:text-left"
      >
        <p className="text-[16.5px] leading-7 text-oa-muted-fg">
          <span className="font-medium text-oa-fg">
            {hiddenCount} more setup{hiddenCount === 1 ? "" : "s"} in this scan.
          </span>{" "}
          Pro unlocks every row on this page.
        </p>
        <ProCheckoutButton size="md" className="h-10 px-5 text-[15px]">
          Try Pro
        </ProCheckoutButton>
      </div>
    </div>
  );
}

function ScanRowGhost() {
  return (
    <div className="flex items-start gap-3 px-3 py-3 sm:px-5">
      <div className="size-8 rounded-full bg-oa-secondary" />
      <div className="w-28 shrink-0 space-y-2 sm:w-44">
        <div className="h-4 w-14 rounded-full bg-oa-secondary" />
        <div className="h-3 w-24 rounded-full bg-oa-secondary" />
      </div>
      <div className="h-6 w-28 rounded-full bg-oa-secondary" />
      <div className="ml-auto space-y-2">
        <div className="ml-auto h-4 w-16 rounded-full bg-oa-secondary" />
        <div className="ml-auto h-3 w-12 rounded-full bg-oa-secondary" />
      </div>
    </div>
  );
}

/* ── the screener plate ─────────────────────────────────────────────────── */
function MarketScans({
  scans,
  isSubscribed,
  trackedIds,
  trackedCount,
}: {
  scans: { key: string; label: string; blurb: string; rows: ScreenerRow[] }[];
  isSubscribed: boolean;
  trackedIds?: string[];
  trackedCount?: number;
}) {
  const populated = scans.filter((s) => s.rows.length > 0);
  const [activeKey, setActiveKey] = useState(populated[0]?.key ?? "");
  if (populated.length === 0) return null;

  const active = populated.find((s) => s.key === activeKey) ?? populated[0];
  const freeLimit = active.key === "trump" ? TRUMP_FREE_ROWS : FREE_ROWS;
  const visibleRows = isSubscribed
    ? active.rows
    : active.rows.slice(0, freeLimit);
  const hiddenCount = active.rows.length - visibleRows.length;

  function select(key: string) {
    setActiveKey(key);
    captureEvent("explore_category_selected", { category: key });
  }

  return (
    <section aria-label="Market scans">
      {/* heading and switcher live outside the card, like every other section */}
      <h2 className="text-2xl font-medium tracking-tight text-oa-fg">
        Market scans
      </h2>

      {/* full-width tab row; the active scan's line sits right under it */}
      <nav
        aria-label="Scans"
        className="-mx-1 mt-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="inline-flex items-center gap-0.5 rounded-full border border-oa-border bg-oa-bg p-1 sm:gap-1">
          {populated.map((scan) => {
            const selected = scan.key === active.key;
            return (
              <button
                key={scan.key}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => select(scan.key)}
                className={`relative flex h-8 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] sm:h-9 sm:px-3 sm:text-sm ${
                  selected ? "text-white" : "text-oa-muted-fg hover:text-oa-fg"
                }`}
              >
                {selected ? (
                  <motion.span
                    layoutId="oa-scan-pill"
                    transition={LAYOUT}
                    className="absolute inset-0 rounded-full bg-oa-primary shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                    aria-hidden="true"
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-1.5">
                  {scan.key === "trump" ? (
                    <Image
                      src="/trump-avatar.png"
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-full"
                    />
                  ) : null}
                  {scan.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <AnimatePresence initial={false} mode="wait">
        <motion.p
          key={active.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="mt-3 text-[16.5px] leading-7 text-oa-muted-fg"
        >
          {active.blurb}
        </motion.p>
      </AnimatePresence>

      {/* the table, on its own */}
      <SquircleSurface className="mt-4 overflow-hidden border border-oa-border bg-oa-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={active.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <div className="max-h-[40rem] overflow-y-auto">
              {visibleRows.map((row) => (
                <ScanRow
                  key={row.key}
                  row={row}
                  category={active.key}
                  isSubscribed={isSubscribed}
                  trackedIds={trackedIds}
                  trackedCount={trackedCount}
                />
              ))}
            </div>
            {hiddenCount > 0 ? (
              <GateStrip hiddenCount={hiddenCount} />
            ) : (
              <div className="h-2" />
            )}
          </motion.div>
        </AnimatePresence>
      </SquircleSurface>
    </section>
  );
}

/* ── the Pro plate: value stack, anchor price, risk reversal ────────────── */
function ProPlate() {
  return (
    <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="rounded-[22px] bg-oa-bg px-6 py-10 sm:rounded-[44px] sm:px-10 sm:py-14">
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
          <ProCheckoutButton className="h-11 px-6 text-base">
            Try Pro
          </ProCheckoutButton>
          <p className="text-[16.5px] text-oa-muted-fg">
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
export function OaExplore({
  trending,
  hotStocks,
  nearHighs,
  nearLows,
  momentumStocks,
  newsSpikes,
  catalystStocks,
  dipStocks,
  trumpMentions,
  aiCapexRows,
  aiCapexWatchlist,
  isSubscribed,
  trackedIds,
  trackedCount,
}: {
  trending: TrendingStock[];
  hotStocks: HeatRow[];
  nearHighs: Near52WeekRow[];
  nearLows: Near52WeekRow[];
  momentumStocks: HeatRow[];
  newsSpikes: HeatRow[];
  catalystStocks: HeatRow[];
  dipStocks: HeatRow[];
  trumpMentions: TrumpMentionRow[];
  aiCapexRows: AiCapexRow[];
  aiCapexWatchlist: AiCapexWatchRow[];
  isSubscribed: boolean;
  trackedIds?: string[];
  trackedCount?: number;
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
      trump_count: trumpMentions.length,
      ai_capex_count: aiCapexRows.length,
    });
    // Fires once per mount to mark the page view; counts are a snapshot, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scans = SCANS.map((scan) => ({
    ...scan,
    rows:
      scan.key === "hot"
        ? rowsFromHeat(hotStocks, "hot")
        : scan.key === "momentum"
          ? rowsFromHeat(momentumStocks, "momentum")
          : scan.key === "near_high"
            ? rowsFromNear52(nearHighs, "high")
            : scan.key === "near_low"
              ? rowsFromNear52(nearLows, "low")
              : scan.key === "news_spike"
                ? rowsFromHeat(newsSpikes, "news_spike")
                : scan.key === "catalyst"
                  ? rowsFromHeat(catalystStocks, "catalyst")
                  : scan.key === "dip"
                    ? rowsFromHeat(dipStocks, "dip")
                    : rowsFromTrump(trumpMentions),
  }));

  return (
    <div className={`${FRAME} flex flex-col gap-12 py-8 sm:gap-16 sm:py-12`}>
      {/* headline: the outcome first, the mechanics second */}
      <header className="max-w-2xl">
        <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[2rem] leading-[1.08] sm:text-4xl sm:leading-[1.06]">
          See what&rsquo;s moving{" "}
          <span className="text-oa-muted-fg">before the crowd does.</span>
        </h1>
      </header>

      <TrendingStrip stocks={trending} />

      <AiCapexSection
        rows={aiCapexRows}
        watchlist={aiCapexWatchlist}
        isSubscribed={isSubscribed}
        trackedIds={trackedIds}
        trackedCount={trackedCount}
        unlockAction={
          <ProCheckoutButton size="md" className="h-10 px-5 text-[15px]">
            Try Pro
          </ProCheckoutButton>
        }
      />

      <section aria-label="Market scans">
        <MarketScans
          scans={scans}
          isSubscribed={isSubscribed}
          trackedIds={trackedIds}
          trackedCount={trackedCount}
        />
      </section>

      {!isSubscribed ? <ProPlate /> : null}
    </div>
  );
}
