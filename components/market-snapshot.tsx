import type { MacroTick } from "@/lib/macro";
import type { MarketBreadthDoc } from "@/lib/market-signals";

type Props = {
  ticks: MacroTick[];
  breadth?: MarketBreadthDoc | null;
};

function formatVolume(v: number | undefined): string {
  if (typeof v !== "number" || v <= 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}

export function MarketSnapshot({ breadth }: Props) {
  if (!breadth) return null;

  const advancers = breadth.advancers ?? 0;
  const decliners = breadth.decliners ?? 0;
  const unchanged = breadth.unchanged ?? 0;
  const total = advancers + decliners + unchanged;
  const advPct = total > 0 ? (advancers / total) * 100 : 0;
  const decPct = total > 0 ? (decliners / total) * 100 : 0;
  const unchPct = total > 0 ? (unchanged / total) * 100 : 0;

  const upVol = breadth.up_volume ?? 0;
  const downVol = breadth.down_volume ?? 0;
  const volTotal = upVol + downVol;
  const upVolPct = volTotal > 0 ? (upVol / volTotal) * 100 : 0;
  const volatility = breadth.volatility_proxy?.median_abs_day_change_pct;
  const new52High = breadth.new_52w_high ?? 0;
  const new52Low = breadth.new_52w_low ?? 0;

  const tilt =
    advPct - decPct >= 10
      ? { label: "Broad rally", color: "text-[#10b981]" }
      : decPct - advPct >= 10
        ? { label: "Broad sell-off", color: "text-[#ef4444]" }
        : { label: "Mixed tape", color: "text-[#6b7280]" };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h2 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            Market breadth
          </h2>
          <p className="text-[13px] text-[#6b7280] max-w-xl">
            Are most stocks joining today’s move, or is the index being carried by a few?
          </p>
        </div>
        <span className={`text-[12px] font-semibold tracking-[0.04em] uppercase ${tilt.color}`}>
          {tilt.label}
        </span>
      </div>

      {/* Advancers / decliners bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              Advancing
            </span>
            <span className="text-[20px] font-semibold tabular-nums text-[#10b981]">
              {advancers}
              <span className="ml-1.5 text-[12px] font-medium text-[#6b7280]">
                {Math.round(advPct)}%
              </span>
            </span>
          </div>
          {unchanged > 0 && (
            <div className="hidden sm:flex flex-col items-center">
              <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
                Flat
              </span>
              <span className="text-[14px] font-semibold tabular-nums text-[#6b7280]">
                {unchanged}
              </span>
            </div>
          )}
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              Declining
            </span>
            <span className="text-[20px] font-semibold tabular-nums text-[#ef4444]">
              {decliners}
              <span className="ml-1.5 text-[12px] font-medium text-[#6b7280]">
                {Math.round(decPct)}%
              </span>
            </span>
          </div>
        </div>

        <div className="relative h-2 rounded-full overflow-hidden bg-[#f3f4f6] flex">
          <div
            className="h-full bg-[#10b981] transition-all"
            style={{ width: `${advPct}%` }}
          />
          <div
            className="h-full bg-[#d1d5db] transition-all"
            style={{ width: `${unchPct}%` }}
          />
          <div
            className="h-full bg-[#ef4444] transition-all"
            style={{ width: `${decPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] tabular-nums text-[#9ca3af]">
          <span>{breadth.instrument_count} instruments</span>
          <span>{breadth.as_of_date}</span>
        </div>
      </div>

      {/* Inline supporting stats — flat, no card chrome */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5 pt-5 border-t border-[#f3f4f6]">
        <Stat
          label="Up volume"
          value={formatVolume(upVol)}
          tone="up"
          helper={volTotal > 0 ? `${Math.round(upVolPct)}% of total` : undefined}
          bar={volTotal > 0 ? upVolPct : undefined}
          barTone="up"
        />
        <Stat
          label="Down volume"
          value={formatVolume(downVol)}
          tone="down"
          helper={volTotal > 0 ? `${Math.round(100 - upVolPct)}% of total` : undefined}
          bar={volTotal > 0 ? 100 - upVolPct : undefined}
          barTone="down"
        />
        <Stat
          label="52W highs / lows"
          value={
            <>
              <span className="text-[#10b981]">{new52High}</span>
              <span className="text-[#d1d5db] mx-1">/</span>
              <span className="text-[#ef4444]">{new52Low}</span>
            </>
          }
          helper="New today"
        />
        <Stat
          label="Volatility"
          value={typeof volatility === "number" ? `${volatility.toFixed(2)}%` : "—"}
          helper="Median |Δ| day move"
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  helper,
  tone,
  bar,
  barTone,
}: {
  label: string;
  value: React.ReactNode;
  helper?: string;
  tone?: "up" | "down" | "ink";
  bar?: number;
  barTone?: "up" | "down";
}) {
  const valueClass =
    tone === "up"
      ? "text-[#10b981]"
      : tone === "down"
        ? "text-[#ef4444]"
        : "text-[#111111]";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
        {label}
      </span>
      <span className={`text-[22px] font-semibold tabular-nums leading-none ${valueClass}`}>
        {value}
      </span>
      {typeof bar === "number" && (
        <div className="relative h-1 rounded-full bg-[#f3f4f6] overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.max(2, Math.min(100, bar))}%`,
              background: barTone === "down" ? "#ef4444" : "#10b981",
            }}
          />
        </div>
      )}
      {helper && (
        <span className="text-[11px] text-[#6b7280] leading-tight">{helper}</span>
      )}
    </div>
  );
}
