"use client";

import { AnimatedNumber } from "@/components/animated-number";
import { countdownParts } from "@/lib/market-session";

/** Ticking D/H/M/S cells with the transitions.dev digit pop on change. */
export function CountdownClock({ msLeft }: { msLeft: number }) {
  const parts = countdownParts(msLeft);
  const cells: Array<{ key: string; label: string; value: string }> = [];
  if (parts.days > 0) cells.push({ key: "d", label: "days", value: String(parts.days) });
  cells.push({ key: "h", label: "hrs", value: String(parts.hours).padStart(2, "0") });
  cells.push({ key: "m", label: "min", value: String(parts.minutes).padStart(2, "0") });
  cells.push({ key: "s", label: "sec", value: String(parts.seconds).padStart(2, "0") });

  return (
    <span className="flex items-stretch gap-1.5" role="timer" aria-label="Time until the market opens">
      {cells.map((cell) => (
        <span key={cell.key} className="t-clock-cell">
          <span className="oa-mono text-[20px] font-semibold leading-6 tabular-nums text-oa-fg">
            {cell.key === "s" ? cell.value : <AnimatedNumber text={cell.value} />}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-oa-muted-fg">{cell.label}</span>
        </span>
      ))}
    </span>
  );
}
