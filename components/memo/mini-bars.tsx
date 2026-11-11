import { NUM } from "@/components/oa/kit";
import { SERIES_VARS } from "@/components/backtest/format";

/**
 * Two or three thin labelled bars on one scale, from a shared zero: a part of
 * the whole against the S&P 500's, or the portfolio against the S&P 500 over
 * the same stretch. `domain` fixes the scale (so rows of a list compare);
 * otherwise it fits the values, always including 0.
 */

export type MiniBar = { label: string; value: number; text: string; series: "a" | "b" };

export function MiniBars({
  bars,
  domain,
  className = "",
  labelWidth = "4.5rem",
  hideLabels = false,
}: {
  bars: MiniBar[];
  domain?: [number, number];
  className?: string;
  labelWidth?: string;
  /** For a list with its own legend: the names are read out but not shown. */
  hideLabels?: boolean;
}) {
  if (bars.length === 0) return null;
  const lo = Math.min(0, domain?.[0] ?? Math.min(...bars.map((bar) => bar.value)));
  const hi = Math.max(0, domain?.[1] ?? Math.max(...bars.map((bar) => bar.value)));
  const span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;
  return (
    <div className={`${SERIES_VARS} grid items-center gap-x-2 gap-y-1 ${className}`} style={{ gridTemplateColumns: hideLabels ? "minmax(0,1fr) 3.25rem" : `${labelWidth} minmax(0,1fr) auto` }}>
      {bars.map((bar) => {
        const size = (Math.abs(bar.value) / span) * 100;
        const left = bar.value >= 0 ? zero : zero - size;
        return (
          <div key={bar.label} className="contents">
            {hideLabels ? (
              <span className="sr-only">{bar.label}</span>
            ) : (
              <span className="truncate text-[12px] leading-4 text-oa-muted-fg" title={bar.label}>
                {bar.label}
              </span>
            )}
            <span aria-hidden="true" className="relative block h-2 rounded-full bg-oa-bg">
              {lo < 0 && hi > 0 ? <span className="absolute inset-y-[-2px] w-px bg-oa-border" style={{ left: `${zero}%` }} /> : null}
              <span
                className={`absolute inset-y-0 ${bar.value >= 0 ? "rounded-r-full" : "rounded-l-full"} ${bar.series === "a" ? "bg-[var(--series-a)]" : "bg-[var(--series-b)]"}`}
                style={{ left: `${left}%`, width: `${Math.max(size, bar.value === 0 ? 0 : 1.5)}%` }}
              />
            </span>
            <span className={`${NUM} text-right text-[12px] leading-4 text-oa-fg`}>{bar.text}</span>
          </div>
        );
      })}
    </div>
  );
}
