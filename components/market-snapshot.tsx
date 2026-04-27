import type { MacroTick } from "@/lib/macro";
import type { MarketBreadthDoc } from "@/lib/market-signals";

type Props = {
  ticks: MacroTick[];
  breadth?: MarketBreadthDoc | null;
};

// ── Index Tape helpers ────────────────────────────────────────────────────────

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${Math.abs(v).toFixed(2)}%`;
}

function fmtPrice(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function formatVolume(v: number | undefined): string {
  if (typeof v !== "number" || v <= 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}

function TickRow({ tick }: { tick: MacroTick }) {
  const change = tick.day_change_pct;
  const up = typeof change === "number" && change > 0;
  const down = typeof change === "number" && change < 0;
  const color = up
    ? "text-signal-bullish"
    : down
      ? "text-signal-bearish"
      : "text-on-surface-variant";
  const arrow = up ? "▲" : down ? "▼" : "•";

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2.5">
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] font-bold text-on-surface leading-tight">
          {tick.ticker}
        </span>
        <span className="text-[10px] text-on-surface-variant">{tick.name}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[15px] font-semibold text-on-surface tabular-nums">
          {fmtPrice(tick.price)}
        </span>
        <div className={`flex items-center gap-1 tabular-nums ${color} min-w-[60px] justify-end`}>
          <span className="text-[10px]">{arrow}</span>
          <span className="text-[12px] font-bold">{fmtPct(change)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketSnapshot({ ticks, breadth }: Props) {
  const hasTicks = ticks?.length > 0;
  const hasBreadth = !!breadth;

  if (!hasTicks && !hasBreadth) return null;

  // Breadth calculations
  const total = breadth
    ? (breadth.advancers ?? 0) + (breadth.decliners ?? 0) + (breadth.unchanged ?? 0)
    : 0;
  const advPct = breadth && total > 0 ? (breadth.advancers / total) * 100 : 0;
  const decPct = breadth && total > 0 ? (breadth.decliners / total) * 100 : 0;
  const unchPct = breadth && total > 0 ? (breadth.unchanged / total) * 100 : 0;
  const upVol = breadth?.up_volume ?? 0;
  const downVol = breadth?.down_volume ?? 0;
  const volTotal = upVol + downVol;
  const upVolPct = volTotal > 0 ? (upVol / volTotal) * 100 : 0;
  const volatility = breadth?.volatility_proxy?.median_abs_day_change_pct;

  return (
    <div className="bg-surface-container-lowest brutalist-border p-6 flex flex-col h-full gap-5">

      {/* ── Index Tape ───────────────────────────────────────────────── */}
      {hasTicks && (
        <div>
          <h3 className="text-[14px] font-semibold text-on-surface">Index Tape</h3>
          <p className="text-[11px] text-on-surface-variant leading-snug mt-1 mb-3">
            Where the major benchmarks closed today.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {ticks.map((tick) => (
              <TickRow key={tick.instrument_id} tick={tick} />
            ))}
          </div>
        </div>
      )}

      {/* ── Market Breadth ───────────────────────────────────────────── */}
      {hasBreadth && breadth && (
        <div className={hasTicks ? "pt-4 border-t border-outline-variant/40" : ""}>
          <h3 className="text-[14px] font-semibold text-on-surface">Market Breadth</h3>
          <p className="text-[11px] text-on-surface-variant leading-snug mt-1 mb-3">
            Are most stocks joining today's move, or is the index being carried by a few?
          </p>

          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-on-surface">Advancers vs Decliners</span>
              <span className="text-on-surface-variant tabular-nums">
                {breadth.advancers} up · {breadth.decliners} down · {breadth.unchanged} flat
              </span>
            </div>
            <div className="relative h-2 bg-surface-container-high overflow-hidden flex rounded-full">
              <div className="h-full bg-signal-bullish" style={{ width: `${advPct}%` }} />
              <div className="h-full bg-signal-neutral/60" style={{ width: `${unchPct}%` }} />
              <div className="h-full bg-signal-bearish" style={{ width: `${decPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">Up Volume</span>
              <span className="text-[20px] font-bold text-signal-bullish tabular-nums mt-0.5">
                {formatVolume(upVol)}
              </span>
              <span className="text-[11px] text-on-surface-variant tabular-nums">
                {volTotal > 0 ? `${upVolPct.toFixed(0)}% of total` : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">Down Volume</span>
              <span className="text-[20px] font-bold text-signal-bearish tabular-nums mt-0.5">
                {formatVolume(downVol)}
              </span>
              <span className="text-[11px] text-on-surface-variant tabular-nums">
                {volTotal > 0 ? `${(100 - upVolPct).toFixed(0)}% of total` : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">52W H / L</span>
              <span className="text-[20px] font-bold tabular-nums mt-0.5">
                <span className="text-signal-bullish">{breadth.new_52w_high ?? 0}</span>
                <span className="text-outline mx-1">/</span>
                <span className="text-signal-bearish">{breadth.new_52w_low ?? 0}</span>
              </span>
              <span className="text-[11px] text-on-surface-variant">New today</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">Volatility</span>
              <span className="text-[20px] font-bold text-on-surface tabular-nums mt-0.5">
                {typeof volatility === "number" ? `${volatility.toFixed(2)}%` : "—"}
              </span>
              <span className="text-[11px] text-on-surface-variant">Median |Δ|</span>
            </div>
          </div>

          <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-outline mt-4">
            {breadth.instrument_count} instruments · {breadth.as_of_date}
          </div>
        </div>
      )}
    </div>
  );
}
