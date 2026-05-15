import type { AnomalyItem } from "@/lib/daily-anomalies";

type Props = {
  anomaly: AnomalyItem;
};

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function AnomalyBanner({ anomaly }: Props) {
  const isUp = anomaly.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 md:p-5">
      <div className="flex flex-col gap-2">
        {/* Label row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9ca3af]">
            Today&apos;s move
          </span>
          <span
            className="text-[13px] font-bold tabular-nums"
            style={{ color: changeColor }}
          >
            {isUp ? "▲" : "▼"} {fmtPct(anomaly.day_change_pct)}
          </span>
        </div>

        {/* Headline */}
        {anomaly.headline && (
          <p className="text-[14px] font-semibold text-[#111111] leading-snug">
            {anomaly.headline}
          </p>
        )}
      </div>
    </div>
  );
}
