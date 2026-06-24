import type { ComparativeContext } from "@/lib/stock";

type Props = {
  context: ComparativeContext | null | undefined;
};

function formatPct(v?: number): { text: string; positive: boolean } | null {
  if (typeof v !== "number") return null;
  const positive = v >= 0;
  return { text: `${positive ? "+" : ""}${v.toFixed(2)}%`, positive };
}

function percentileTone(p?: number): { text: string; className: string } | null {
  if (typeof p !== "number") return null;
  const rank = Math.round(p);
  const className =
    p >= 66 ? "text-[#10b981]" : p >= 33 ? "text-on-surface" : "text-[#ef4444]";
  const suffix =
    rank % 10 === 1 && rank !== 11
      ? "st"
      : rank % 10 === 2 && rank !== 12
        ? "nd"
        : rank % 10 === 3 && rank !== 13
          ? "rd"
          : "th";
  return { text: `${rank}${suffix}`, className };
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
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
        {label}
      </span>
      <span className={`text-[22px] font-semibold tabular-nums leading-none ${valueClass ?? "text-on-surface"}`}>
        {value}
      </span>
      {hint && <span className="text-[12px] text-on-surface-variant">{hint}</span>}
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
    <section className="flex flex-col gap-5 pt-6 border-t border-outline-variant">
      <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
        Comparative context
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
        {vsMarket && (
          <Cell
            label="vs Market"
            value={vsMarket.text}
            valueClass={vsMarket.positive ? "text-[#10b981]" : "text-[#ef4444]"}
            hint="Today vs. the broader market"
          />
        )}
        {vsSector && (
          <Cell
            label="vs Sector"
            value={vsSector.text}
            valueClass={vsSector.positive ? "text-[#10b981]" : "text-[#ef4444]"}
            hint="Today vs. its sector peers"
          />
        )}
        {percentile && (
          <Cell
            label="Market rank"
            value={percentile.text}
            valueClass={percentile.className}
            hint="Percentile among all tracked names"
          />
        )}
      </div>
    </section>
  );
}
