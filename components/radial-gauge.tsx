type Props = {
  score: number;
  label?: string;
  size?: number;
  stroke?: number;
  tone?: "bullish" | "bearish" | "neutral" | "muted";
  caption?: string;
  suffix?: string;
};

const TONE_CLASS: Record<NonNullable<Props["tone"]>, string> = {
  bullish: "text-signal-bullish",
  bearish: "text-signal-bearish",
  neutral: "text-signal-neutral",
  muted: "text-outline-variant",
};

export function toneFromScore(score: number | null | undefined): NonNullable<Props["tone"]> {
  if (score === null || score === undefined) return "muted";
  if (score >= 70) return "bullish";
  if (score >= 40) return "neutral";
  return "bearish";
}

export function RadialGauge({
  score,
  label,
  size = 120,
  stroke = 10,
  tone = "neutral",
  caption,
  suffix,
}: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const toneClass = TONE_CLASS[tone];

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-outline-variant/30"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`${toneClass} transition-all`}
            style={{ stroke: "currentColor" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-[28px] font-bold leading-none tabular-nums ${toneClass}`}>
            {Math.round(clamped)}
            {suffix && <span className="text-[14px] ml-0.5">{suffix}</span>}
          </span>
          {caption && (
            <span className="text-[9px] font-semibold tracking-[0.18em] uppercase text-on-surface-variant mt-1">
              {caption}
            </span>
          )}
        </div>
      </div>
      {label && (
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant text-center">
          {label}
        </span>
      )}
    </div>
  );
}
