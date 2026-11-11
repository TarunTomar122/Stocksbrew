import { longDay, signedPct, toneOf } from "@/components/backtest/format";
import { Verdict } from "@/components/oa/kit/tone";
import { liveHasReturn, type StrategyLive } from "@/lib/strategies";

/** Narrower than the kit frame, same gutters: cards at 8px on a phone, loose text at 16px (.oa-page-frame). */
export const PAGE_FRAME = "oa-page-frame mx-auto w-full max-w-[76rem] px-2 pb-24 pt-3 sm:px-6 sm:pt-4 lg:pb-10 lg:pt-6";

/** Swings against the S&P 500 as good or bad for the holder: smaller is steadier, bigger is riskier. */
export const SWINGS_TONE: Record<string, "up" | "down" | "flat"> = {
  lower: "up",
  similar: "flat",
  higher: "down",
  unknown: "flat",
};

const RISK_SHORT: Record<string, string> = {
  lower: "Smaller swings",
  similar: "Market-like swings",
  higher: "Bigger swings",
  unknown: "Not measured yet",
};

export function RiskTag({ level, ratio }: { level: string; ratio: number | null }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      title={ratio === null ? undefined : `Backtested volatility was ${ratio.toFixed(2)} times the S&P 500's`}
    >
      {ratio === null ? null : <span className="oa-mono text-[12.5px] tabular-nums text-oa-muted-fg">{ratio.toFixed(2)}×</span>}
      <Verdict tone={SWINGS_TONE[level] ?? "flat"}>{RISK_SHORT[level] ?? RISK_SHORT.unknown}</Verdict>
    </span>
  );
}

/** The live record in one line: the day it began until a close after the fill day, then its return. */
export function LiveLine({
  live,
  className = "",
  bare = false,
}: {
  live: StrategyLive;
  className?: string;
  /** The figure alone, when the list says the session count once (it is the same on every row). */
  bare?: boolean;
}) {
  // Before a close after the fill day there is no return to show, only the day tracking began.
  if (!liveHasReturn(live) || live.strategy_return === null) {
    const began = live.first_fill_date ?? live.since;
    return <span className={`text-oa-muted-fg ${className}`}>{live.first_fill_date ? `Began ${longDay(began)}` : `Starts after ${longDay(began)}`}</span>;
  }
  return (
    <span className={className}>
      <span className={`oa-mono tabular-nums ${toneOf(live.strategy_return)}`}>{signedPct(live.strategy_return, 2)}</span>
      {bare ? null : (
        <span className="text-oa-muted-fg">
          {" "}
          in {live.sessions} session{live.sessions === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}
