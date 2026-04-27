import type { AnalystConsensus } from "@/lib/stock";

type Props = {
  consensus: AnalystConsensus | null | undefined;
  currentPrice?: number;
};

function upsideTone(
  currentPrice?: number,
  target?: number,
): { value: string; color: string } | null {
  if (typeof currentPrice !== "number" || typeof target !== "number" || currentPrice <= 0) {
    return null;
  }
  const upside = ((target - currentPrice) / currentPrice) * 100;
  return {
    value: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`,
    color: upside >= 0 ? "text-signal-bullish" : "text-signal-bearish",
  };
}

export function AnalystConsensus({ consensus, currentPrice }: Props) {
  const buy = consensus?.buy ?? 0;
  const hold = consensus?.hold ?? 0;
  const sell = consensus?.sell ?? 0;
  const total = buy + hold + sell;
  const label = consensus?.label ?? "—";
  const target = consensus?.target_price;
  const upside = upsideTone(currentPrice, target);

  const buyPct = total > 0 ? Math.round((buy / total) * 100) : 0;
  const dominantLean =
    total > 0
      ? buy >= hold && buy >= sell
        ? "bullish"
        : sell >= hold
          ? "bearish"
          : "mixed"
      : "none";

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6 h-full flex flex-col">
      <h2 className="text-[14px] font-semibold text-on-surface">
        Analyst Consensus
      </h2>
      <p className="text-[11px] text-on-surface-variant leading-snug mt-1 mb-4">
        Where Wall Street sits right now — the rating call, the average price
        target, and how the ratings are split.
      </p>

      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-[28px] font-bold tracking-tight text-on-surface leading-none">
          {label}
        </span>
        {typeof target === "number" && (
          <span className="text-[13px] font-semibold text-on-surface-variant">
            Target $
            {target.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
        )}
      </div>
      {total > 0 && (
        <p className="text-[11px] text-on-surface-variant mb-4">
          Based on {total} analyst{total === 1 ? "" : "s"}
          {dominantLean === "bullish" && buyPct >= 70
            ? ` — ${buyPct}% rate it a Buy`
            : dominantLean === "bearish" && total > 0
              ? ` — leaning bearish`
              : dominantLean === "mixed"
                ? ` — ratings are split`
                : ""}
        </p>
      )}

      {upside && (
        <div className="mb-4">
          <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-outline mb-1">
            Implied Upside
          </div>
          <div className={`text-[24px] font-bold tabular-nums ${upside.color}`}>
            {upside.value}
          </div>
          <p className="text-[10px] text-on-surface-variant leading-snug mt-1">
            Gap between current price and the average target.
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="text-[13px] text-on-surface-variant py-2">
          No analyst coverage reported.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex h-2 overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${(buy / total) * 100}%`,
                backgroundColor: "var(--signal-bullish)",
              }}
            />
            <div
              className="h-full"
              style={{
                width: `${(hold / total) * 100}%`,
                backgroundColor: "var(--signal-neutral)",
              }}
            />
            <div
              className="h-full"
              style={{
                width: `${(sell / total) * 100}%`,
                backgroundColor: "var(--signal-bearish)",
              }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-bold tracking-[0.15em] uppercase">
            <span className="text-signal-bullish">Buy {buy}</span>
            <span className="text-on-surface-variant">Hold {hold}</span>
            <span className="text-signal-bearish">Sell {sell}</span>
          </div>
        </div>
      )}
    </section>
  );
}
