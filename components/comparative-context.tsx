import type { ComparativeContext } from "@/lib/stock";

type Props = {
  context: ComparativeContext | null | undefined;
};

function formatPct(v?: number): { text: string; color: string } | null {
  if (typeof v !== "number") return null;
  const positive = v >= 0;
  return {
    text: `${positive ? "+" : ""}${v.toFixed(2)}%`,
    color: positive ? "text-signal-bullish" : "text-signal-bearish",
  };
}

function percentileTone(p?: number): { text: string; color: string } | null {
  if (typeof p !== "number") return null;
  const rank = Math.round(p);
  const color =
    p >= 66
      ? "text-signal-bullish"
      : p >= 33
        ? "text-on-surface"
        : "text-signal-bearish";
  const suffix =
    rank % 10 === 1 && rank !== 11
      ? "st"
      : rank % 10 === 2 && rank !== 12
        ? "nd"
        : rank % 10 === 3 && rank !== 13
          ? "rd"
          : "th";
  return { text: `${rank}${suffix}`, color };
}

function Cell({
  label,
  value,
  valueClass,
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
        {label}
      </span>
      <span className={`text-[18px] font-bold tabular-nums ${valueClass ?? "text-on-surface"}`}>
        {value}
      </span>
      {hint && <span className="text-[11px] text-on-surface-variant">{hint}</span>}
    </div>
  );
}

export function ComparativeContextRow({ context }: Props) {
  if (
    !context ||
    (typeof context.vs_market_day_change_pct !== "number" &&
      typeof context.vs_sector_day_change_pct !== "number" &&
      typeof context.market_percentile !== "number")
  ) {
    return null;
  }

  const vsMarket = formatPct(context.vs_market_day_change_pct);
  const vsSector = formatPct(context.vs_sector_day_change_pct);
  const percentile = percentileTone(context.market_percentile);

  return (
    <section className="bg-surface-container-lowest brutalist-border p-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {vsMarket && (
          <Cell
            label="vs Market"
            value={vsMarket.text}
            valueClass={vsMarket.color}
            hint="Today vs. the broader market"
          />
        )}
        {vsSector && (
          <Cell
            label="vs Sector"
            value={vsSector.text}
            valueClass={vsSector.color}
            hint="Today vs. its sector peers"
          />
        )}
        {percentile && (
          <Cell
            label="Market Rank"
            value={percentile.text}
            valueClass={percentile.color}
            hint="Percentile among all tracked names"
          />
        )}
      </div>
    </section>
  );
}
