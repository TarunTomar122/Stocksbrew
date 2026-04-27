type Props = {
  score: number;
  label: string;
  mocked?: boolean;
};

function sentimentTone(score: number): {
  color: string;
  tone: string;
} {
  if (score < 35) return { color: "var(--signal-bearish)", tone: "Bearish" };
  if (score < 50) return { color: "var(--signal-neutral)", tone: "Cautious" };
  if (score < 65) return { color: "var(--signal-neutral)", tone: "Mixed" };
  if (score < 80) return { color: "var(--signal-bullish)", tone: "Bullish" };
  return { color: "var(--signal-bullish)", tone: "Euphoric" };
}

function Arc({ from, to, color }: { from: number; to: number; color: string }) {
  // Arc along a 180° semicircle (top half), radius 80, centered at (100, 100).
  const radius = 80;
  const cx = 100;
  const cy = 100;
  const startAngle = Math.PI * (1 - from / 100);
  const endAngle = Math.PI * (1 - to / 100);
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy - radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy - radius * Math.sin(endAngle);
  const largeArc = to - from > 50 ? 1 : 0;
  return (
    <path
      d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`}
      stroke={color}
      strokeWidth="14"
      fill="none"
      strokeLinecap="butt"
    />
  );
}

export function SentimentGauge({ score, label, mocked }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const { color, tone } = sentimentTone(clamped);
  const needleAngle = Math.PI * (1 - clamped / 100);
  const needleLength = 72;
  const needleX = 100 + needleLength * Math.cos(needleAngle);
  const needleY = 100 - needleLength * Math.sin(needleAngle);

  return (
    <div className="bg-surface-container-lowest brutalist-border p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[14px] font-semibold text-on-surface">Sentiment</h3>
        {mocked && (
          <span
            title="Mocked — tm_sentiment_gauge not yet populated."
            className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
          >
            Mock
          </span>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <svg viewBox="0 0 200 120" className="w-full max-w-[180px]" aria-hidden="true">
          {/* Track */}
          <Arc from={0} to={100} color="var(--surface-container-high)" />
          {/* Segments */}
          <Arc from={0} to={35} color="var(--signal-bearish)" />
          <Arc from={35} to={65} color="var(--signal-neutral)" />
          <Arc from={65} to={100} color="var(--signal-bullish)" />
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2={needleX}
            y2={needleY}
            stroke="var(--on-surface)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="100" cy="100" r="6" fill="var(--on-surface)" />
        </svg>

        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-[32px] font-bold tracking-[-0.02em] text-on-surface tabular-nums leading-none">
            {Math.round(clamped)}
          </span>
          <span
            className="text-[11px] font-bold tracking-[0.15em] uppercase"
            style={{ color }}
          >
            {tone}
          </span>
        </div>
        <div className="text-[12px] font-semibold text-on-surface-variant mt-1">
          {label}
        </div>
      </div>
    </div>
  );
}
