import type { AnomalyItem } from "@/lib/daily-anomalies";

type Props = {
  anomaly: AnomalyItem;
};

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/**
 * Small banner shown on stock pages when the stock is in today's
 * daily anomaly list. Gives visitors instant context on why the
 * stock is moving.
 */
export function AnomalyBanner({ anomaly }: Props) {
  const isUp = anomaly.direction === "up";
  const accentColor = isUp ? "#10b981" : "#ef4444";
  const bgColor = isUp ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)";
  const borderColor = isUp ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)";
  const arrow = isUp ? "📈" : "📉";

  return (
    <div
      className="rounded-2xl p-4 border transition-all"
      style={{ background: bgColor, borderColor }}
    >
      <div className="flex items-start gap-3">
        <span className="text-[20px] shrink-0 mt-0.5">{arrow}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[12px] font-bold tracking-[0.08em] uppercase"
              style={{ color: accentColor }}
            >
              Daily anomaly
            </span>
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ color: accentColor }}
            >
              {fmtPct(anomaly.day_change_pct)}
            </span>
          </div>
          {anomaly.headline && (
            <p className="text-[13px] font-medium text-[#111111] leading-snug mb-1">
              {anomaly.headline}
            </p>
          )}
          {anomaly.today_brief && (
            <p className="text-[12px] text-[#6b7280] leading-[1.5] line-clamp-2">
              {anomaly.today_brief}
            </p>
          )}
          {anomaly.catalyst && (
            <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-white/80 text-[10px] font-medium text-[#6b7280] border border-[#e5e7eb]">
              ⚡ {anomaly.catalyst}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
