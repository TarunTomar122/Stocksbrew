"use client";

import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { HeatList, HeatRow } from "@/lib/heat";

/** Free / signed-out users see this many rows per setup bucket; Pro sees the full list. */
const FREE_HEAT_ROWS_PER_CATEGORY = 3;

type Props = {
  data: HeatList | null;
  trackedIds?: string[];
  isSubscribed?: boolean;
};

type SetupMeta = {
  label: string;
  tagline: string;
  icon: string;
  /** Solid background for the round icon tile in the card head — matches the
   * sector spotlight cards on the home page (dark filled circle, white glyph). */
  bg: string;
  fg: string;
  /** Display order — higher urgency / clearer signal first. */
  order: number;
};

const SETUP_META: Record<string, SetupMeta> = {
  overheated: {
    label: "Overheated",
    tagline: "Watch, do not chase",
    icon: "local_fire_department",
    bg: "#dc2626",
    fg: "#ffffff",
    order: 1,
  },
  breakout: {
    label: "Breakout",
    tagline: "Check follow-through",
    icon: "trending_up",
    bg: "#047857",
    fg: "#ffffff",
    order: 2,
  },
  news_spike: {
    label: "News spike",
    tagline: "Read latest context",
    icon: "newspaper",
    bg: "#7c3aed",
    fg: "#ffffff",
    order: 3,
  },
  catalyst_watch: {
    label: "Catalyst watch",
    tagline: "Track catalyst reaction",
    icon: "event",
    bg: "#b45309",
    fg: "#ffffff",
    order: 4,
  },
  dip_setup: {
    label: "Dip setup",
    tagline: "Investigate entry",
    icon: "show_chart",
    bg: "#0052ff",
    fg: "#ffffff",
    order: 5,
  },
  momentum_watch: {
    label: "Momentum watch",
    tagline: "Review setup",
    icon: "speed",
    bg: "#475569",
    fg: "#ffffff",
    order: 6,
  },
};

function setupMeta(key?: string): SetupMeta {
  if (key && SETUP_META[key]) return SETUP_META[key];
  return {
    label: key ? key.replaceAll("_", " ") : "Watching",
    tagline: "Review setup",
    icon: "insights",
    bg: "#1c1c1e",
    fg: "#ffffff",
    order: 99,
  };
}

function fmtPct(v: number | null | undefined): { text: string; positive: boolean } | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, positive: v >= 0 };
}

// ─── Hero summary ─────────────────────────────────────────────────────────────

function HeroSummary({ data }: { data: HeatList }) {
  const summary = data.summary;
  const counts = summary?.counts ?? {};
  const bullish = summary?.bullish_count ?? 0;
  const caution = summary?.caution_count ?? 0;
  const setupEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <section className="rounded-[28px] border border-[#e5e7eb] bg-white p-6 md:p-8 shadow-[0_18px_50px_rgba(17,24,39,0.04)]">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2 max-w-2xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0052ff]">
            Today’s heat read
          </span>
          <h1 className="text-[26px] md:text-[30px] font-semibold tracking-[-0.025em] text-[#111111]">
            {summary?.headline ?? "Heat list"}
          </h1>
          {summary?.body && (
            <p className="text-[14px] leading-relaxed text-[#6b7280]">{summary.body}</p>
          )}
        </div>

        <div className="flex items-end gap-6">
          <Stat label="Bullish" value={bullish} tone="up" />
          <Stat label="Caution" value={caution} tone="down" />
          <Stat label="On the list" value={data.rows.length} />
        </div>
      </div>

      {setupEntries.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 pt-5 border-t border-[#f3f4f6]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af] mr-1">
            Setups today
          </span>
          {setupEntries.map(([setup, count]) => {
            const meta = setupMeta(setup);
            return (
              <span
                key={setup}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] text-[#111111]"
              >
                <span
                  aria-hidden
                  className="flex h-4 w-4 items-center justify-center rounded-full"
                  style={{ background: meta.bg, color: meta.fg }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 11, fontVariationSettings: "'wght' 600" }}
                  >
                    {meta.icon}
                  </span>
                </span>
                {meta.label}
                <span className="font-medium text-[#6b7280]">· {count}</span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "up" | "down";
}) {
  const valueClass =
    tone === "up" ? "text-[#10b981]" : tone === "down" ? "text-[#ef4444]" : "text-[#111111]";
  return (
    <div className="flex flex-col items-start">
      <span className={`text-[28px] font-semibold leading-none tabular-nums ${valueClass}`}>
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af] mt-1">
        {label}
      </span>
    </div>
  );
}

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({
  setup,
  rows,
  trackedIds,
  isSubscribed,
}: {
  setup: string;
  rows: HeatRow[];
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  const meta = setupMeta(setup);
  const displayRows = isSubscribed
    ? rows
    : rows.slice(0, FREE_HEAT_ROWS_PER_CATEGORY);
  const lockedCount = !isSubscribed
    ? Math.max(0, rows.length - FREE_HEAT_ROWS_PER_CATEGORY)
    : 0;

  return (
    <article className="flex flex-col rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
      {/* Card head — matches sector spotlight cards on the home page. */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: meta.bg, color: meta.fg }}
          aria-hidden
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, fontVariationSettings: "'wght' 500" }}
          >
            {meta.icon}
          </span>
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
            {meta.label}
          </span>
          <span className="text-[12px] text-[#6b7280]">
            {rows.length} {rows.length === 1 ? "stock" : "stocks"} · {meta.tagline}
            {!isSubscribed && lockedCount > 0 ? (
              <span className="text-[#9ca3af]"> · Pro unlocks full list</span>
            ) : null}
          </span>
        </div>
      </div>

      {/* Scrollable stock list — fixed height so all four cards line up (Pro). */}
      <ul
        className={`flex flex-col overflow-y-auto scrollbar-hide border-t border-[#f3f4f6] ${
          isSubscribed ? "max-h-[420px]" : "max-h-none"
        }`}
      >
        {displayRows.map((row) => (
          <CategoryStockRow
            key={row.instrument_id}
            row={row}
            trackedIds={trackedIds}
            isSubscribed={isSubscribed}
          />
        ))}
      </ul>

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
    </article>
  );
}

function CategoryStockRow({
  row,
  trackedIds,
  isSubscribed,
}: {
  row: HeatRow;
  trackedIds: string[];
  isSubscribed: boolean;
}) {
  const pct = fmtPct(row.day_change_pct);
  const market = row.instrument_id.startsWith("IN_") ? "IN" : "US";
  const rawReason =
    row.reason_sentence ||
    (row.reasons && row.reasons[0]) ||
    row.primary_driver ||
    "On the heat list.";
  // The backend reason_sentence often appends ", RSI X.Y, heat Z." — those
  // numbers already appear as chips, so trim them from the prose.
  const reason = rawReason
    .replace(/,\s*RSI\s+[\d.]+/gi, "")
    .replace(/,\s*heat\s+[\d.]+/gi, "")
    .replace(/\s+\.\s*$/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  const rsiVal = row.rsi_14;
  const rsiState = row.rsi_14_state;
  const rsiTone =
    rsiState === "overbought" || (typeof rsiVal === "number" && rsiVal >= 70)
      ? { bg: "#fff7ed", fg: "#c2410c", short: "OB" }
      : rsiState === "oversold" || (typeof rsiVal === "number" && rsiVal <= 30)
        ? { bg: "#eff6ff", fg: "#0052ff", short: "OS" }
        : { bg: "#f3f4f6", fg: "#6b7280", short: "NTR" };
  const momentum =
    typeof row.momentum_score === "number" ? Math.round(row.momentum_score) : null;
  const driver = row.primary_driver;
  const secondary = (row.secondary_drivers ?? []).filter(Boolean).slice(0, 2);

  return (
    <li className="flex flex-col gap-2.5 px-5 py-4 border-t border-[#f3f4f6] hover:bg-[#fafafa] transition-colors">
      {/* Header: logo + ticker + price + day chg + bookmark */}
      <div className="flex items-start gap-3">
        <a
          href={`/stock/${encodeURIComponent(row.ticker)}`}
          className="flex items-center gap-2.5 flex-1 min-w-0"
        >
          <StockLogo ticker={row.ticker} market={market} size={32} />
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
              {row.ticker}
            </span>
            {pct && (
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  pct.positive ? "text-[#10b981]" : "text-[#ef4444]"
                }`}
              >
                {pct.positive ? "▲" : "▼"} {pct.text.replace("+", "").replace("-", "")}
              </span>
            )}
          </div>
        </a>
        <TrackButton
          ticker={row.ticker}
          instrumentId={row.instrument_id}
          isTracked={trackedIds.includes(row.instrument_id)}
          isSubscribed={isSubscribed}
          variant="icon"
        />
      </div>

      {/* Reason sentence */}
      <p className="line-clamp-2 text-[12px] text-[#6b7280] leading-snug">{reason}</p>

      {/* Metrics strip */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {typeof rsiVal === "number" && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ background: rsiTone.bg, color: rsiTone.fg }}
            title={`RSI ${rsiState ?? "neutral"}`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-70">
              RSI
            </span>
            {rsiVal.toFixed(1)}
            <span className="text-[9px] font-semibold uppercase tracking-[0.04em] opacity-70">
              {rsiTone.short}
            </span>
          </span>
        )}
        {momentum !== null && (
          <MetricChip label="Mom" value={momentum} tone="ink" />
        )}
      </div>

      {/* Drivers — tiny */}
      {(driver || secondary.length > 0) && (
        <div className="flex items-center gap-1 flex-wrap text-[10px] text-[#9ca3af] leading-snug">
          {driver && (
            <span className="font-semibold text-[#374151]">{driver}</span>
          )}
          {secondary.map((d) => (
            <span key={d} className="before:content-['·'] before:mx-1">
              {d}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function MetricChip({
  label,
  value,
  tone,
  bar,
}: {
  label: string;
  value: number;
  tone: "warn" | "info" | "ink";
  bar?: boolean;
}) {
  const palette =
    tone === "warn"
      ? { bg: "#fff7ed", fg: "#c2410c", barFill: "linear-gradient(90deg, #f59e0b, #ef4444)" }
      : tone === "info"
        ? { bg: "#eff6ff", fg: "#0052ff", barFill: "linear-gradient(90deg, #0052ff, #10b981)" }
        : { bg: "#f3f4f6", fg: "#374151", barFill: "#374151" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ background: palette.bg, color: palette.fg }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.06em] opacity-70">
        {label}
      </span>
      {value}
      {bar && (
        <span className="relative inline-block h-1 w-8 overflow-hidden rounded-full bg-white/70 ml-0.5">
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(6, Math.min(100, value))}%`,
              background: palette.barFill,
            }}
          />
        </span>
      )}
    </span>
  );
}

// ─── Empty / list ─────────────────────────────────────────────────────────────

function groupBySetup(rows: HeatRow[]): { setup: string; rows: HeatRow[] }[] {
  const buckets = new Map<string, HeatRow[]>();
  for (const row of rows) {
    const key = row.setup_type || "momentum_watch";
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  return Array.from(buckets.entries())
    .map(([setup, rows]) => ({ setup, rows }))
    .sort((a, b) => setupMeta(a.setup).order - setupMeta(b.setup).order);
}

export function HeatListView({ data, trackedIds = [], isSubscribed = false }: Props) {
  if (!data || data.rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-[#e5e7eb] bg-white p-10 text-center shadow-[0_18px_50px_rgba(17,24,39,0.04)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fff7ed] text-[#c2410c]">
          <span className="material-symbols-outlined text-[22px]">local_fire_department</span>
        </div>
        <p className="mt-4 text-[12px] font-semibold tracking-[0.16em] uppercase text-[#111111]">
          Heat list is warming up
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7280] max-w-md mx-auto">
          We have not generated today&apos;s ranked hot-stock signal yet. Check back after the
          next market refresh.
        </p>
      </div>
    );
  }

  const rows = [...data.rows];
  const groups = groupBySetup(rows);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {groups.map(({ setup, rows }) => (
          <CategoryCard
            key={setup}
            setup={setup}
            rows={rows}
            trackedIds={trackedIds}
            isSubscribed={isSubscribed}
          />
        ))}
      </div>
    </div>
  );
}
