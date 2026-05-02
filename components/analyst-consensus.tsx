import type { AnalystConsensus } from "@/lib/stock";

type Props = {
  consensus: AnalystConsensus | null | undefined;
  currentPrice?: number;
};

function upsideTone(
  currentPrice?: number,
  target?: number | null,
): { value: string; positive: boolean } | null {
  if (typeof currentPrice !== "number" || typeof target !== "number" || currentPrice <= 0) {
    return null;
  }
  const upside = ((target - currentPrice) / currentPrice) * 100;
  return {
    value: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`,
    positive: upside >= 0,
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
    <section className="flex flex-col gap-5 pt-6 border-t border-[#e5e7eb]">
      <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
        Analyst ratings &amp; forecast
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1px_1fr_1fr] gap-x-8 gap-y-6 items-start">
        {/* Left: rating + count */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[28px] font-semibold tracking-[-0.02em] text-[#111111] leading-none">
              {label}
            </span>
            {typeof target === "number" && (
              <span className="text-[13px] font-medium text-[#6b7280] tabular-nums">
                Target ${target.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          {total > 0 && (
            <p className="text-[13px] text-[#6b7280]">
              Based on {total} analyst{total === 1 ? "" : "s"}
              {dominantLean === "bullish" && buyPct >= 70
                ? ` — ${buyPct}% rate it a Buy`
                : dominantLean === "bearish"
                  ? " — leaning bearish"
                  : dominantLean === "mixed"
                    ? " — ratings are split"
                    : ""}
            </p>
          )}
          {total === 0 && (
            <p className="text-[13px] text-[#6b7280]">No analyst coverage reported.</p>
          )}
        </div>

        <div className="hidden md:block w-px self-stretch bg-[#e5e7eb]" aria-hidden />

        {/* Implied upside cell */}
        {upside ? (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              Implied upside
            </span>
            <span
              className={`text-[24px] font-semibold tabular-nums leading-none ${
                upside.positive ? "text-[#10b981]" : "text-[#ef4444]"
              }`}
            >
              {upside.value}
            </span>
            <span className="text-[12px] text-[#6b7280]">Gap to the avg target</span>
          </div>
        ) : (
          <div />
        )}

        {/* Buy/Hold/Sell split */}
        {total > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              Rating mix
            </span>
            <div className="flex h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
              <div className="h-full bg-[#10b981]" style={{ width: `${(buy / total) * 100}%` }} />
              <div className="h-full bg-[#f59e0b]" style={{ width: `${(hold / total) * 100}%` }} />
              <div className="h-full bg-[#ef4444]" style={{ width: `${(sell / total) * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] font-semibold tabular-nums">
              <span className="text-[#10b981]">Buy {buy}</span>
              <span className="text-[#6b7280]">Hold {hold}</span>
              <span className="text-[#ef4444]">Sell {sell}</span>
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </section>
  );
}
