import type {
  InstitutionalFlowsDoc,
  MarketMoodDoc,
  SentimentGaugeDoc,
} from "@/lib/market-signals";

type Props = {
  gauge?: SentimentGaugeDoc | null;
  mood?: MarketMoodDoc | null;
  flows?: InstitutionalFlowsDoc | null;
  fallbackScore?: number;
  fallbackLabel?: string;
};

function formatRating(raw: string): string {
  return raw
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function deltaLabel(current: number, prev: number | null | undefined): string | null {
  if (prev === null || prev === undefined || Number.isNaN(prev)) return null;
  const diff = current - prev;
  if (Math.abs(diff) < 0.5) return "flat";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}`;
}

// We drop the classic "Fear / Greed" labels in favor of plainer phrasing —
// users were reading "Greed" (high score, bullish tape) as a negative signal.
// "Confident / Cautious" is the same axis without the moral loading.
function gaugeTone(score: number): {
  tone: string;
  color: string;
} {
  if (score < 25) return { tone: "Very Cautious", color: "var(--signal-bearish)" };
  if (score < 45) return { tone: "Cautious", color: "var(--signal-bearish)" };
  if (score < 55) return { tone: "Balanced", color: "var(--signal-neutral)" };
  if (score < 75) return { tone: "Confident", color: "var(--signal-bullish)" };
  return { tone: "Overheated", color: "var(--signal-bullish)" };
}

function formatCr(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}k Cr`;
  return `${value.toFixed(0)} Cr`;
}

function flowDirectionClasses(direction: string): {
  text: string;
  bar: string;
  badge: string;
} {
  if (direction === "inflow") {
    return {
      text: "text-signal-bullish",
      bar: "bg-signal-bullish",
      badge: "bg-signal-bullish/15 text-signal-bullish",
    };
  }
  if (direction === "outflow") {
    return {
      text: "text-signal-bearish",
      bar: "bg-signal-bearish",
      badge: "bg-signal-bearish/15 text-signal-bearish",
    };
  }
  return {
    text: "text-on-surface",
    bar: "bg-signal-neutral",
    badge: "bg-signal-neutral/20 text-on-surface",
  };
}

function flowsHeadline(rows: InstitutionalFlowsDoc["flows"]): string {
  if (!rows.length) return "No data yet";
  const fii = rows.find((f) => f.category === "FII");
  const dii = rows.find((f) => f.category === "DII");
  if (!fii || !dii) {
    const row = fii || dii!;
    return `${row.category} net ₹${row.net_cr >= 0 ? "+" : ""}${row.net_cr.toFixed(0)} Cr`;
  }
  if (fii.direction === "inflow" && dii.direction === "inflow") return "Both sides buying";
  if (fii.direction === "outflow" && dii.direction === "outflow") return "Both sides selling";
  if (fii.direction === "outflow" && dii.direction === "inflow") return "Locals absorbing foreign selling";
  return "Foreign-led, locals fading";
}

export function MarketMoodScore({
  gauge,
  mood,
  fallbackScore,
  fallbackLabel,
  showArc = true,
}: Omit<Props, "flows"> & { showArc?: boolean }) {
  const usingMood = !!mood;
  const score = mood?.score ?? gauge?.score ?? fallbackScore ?? 50;
  const label = mood
    ? formatRating(mood.rating)
    : gauge?.label ?? fallbackLabel ?? "Neutral";
  const clamped = Math.max(0, Math.min(100, score));
  const { tone, color } = gaugeTone(clamped);

  const needleAngle = Math.PI * (1 - clamped / 100);
  const needleLength = 72;
  const needleX = 100 + needleLength * Math.cos(needleAngle);
  const needleY = 100 - needleLength * Math.sin(needleAngle);

  const mocked = !gauge && !mood;
  const dayDelta = mood ? deltaLabel(mood.score, mood.previous_day) : null;
  const weekDelta = mood ? deltaLabel(mood.score, mood.previous_week) : null;
  const monthDelta = mood ? deltaLabel(mood.score, mood.previous_month) : null;

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-semibold text-on-surface">Market Mood</h3>
        {mocked && (
          <span
            title="Mocked — tm_sentiment_gauge not yet populated."
            className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
          >
            Mock
          </span>
        )}
      </div>
      <p className="text-[11px] text-on-surface-variant leading-snug mb-2">
        How investors are leaning today — cautious to confident, on a 0–100 scale.
      </p>

      <div
        className={`flex flex-col ${showArc ? "flex-1 items-center justify-center" : "items-stretch"}`}
      >
        {showArc && (
          <svg viewBox="0 0 200 120" className="w-full max-w-[200px]" aria-hidden="true">
            <Arc from={0} to={100} color="var(--surface-container-high)" />
            <Arc from={0} to={25} color="var(--signal-bearish)" />
            <Arc from={25} to={45} color="var(--signal-bearish)" />
            <Arc from={45} to={55} color="var(--signal-neutral)" />
            <Arc from={55} to={75} color="var(--signal-bullish)" />
            <Arc from={75} to={100} color="var(--signal-bullish)" />
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
        )}

        <div className={`flex items-baseline gap-2 ${showArc ? "mt-1" : "mt-0"}`}>
          <span
            className={`font-bold tracking-[-0.02em] tabular-nums leading-none ${
              showArc ? "text-[40px]" : "text-[48px]"
            }`}
            style={{ color }}
          >
            {Math.round(clamped)}
          </span>
          <span
            className="text-[12px] font-bold tracking-[0.15em] uppercase"
            style={{ color }}
          >
            {tone}
          </span>
        </div>
        <div className="text-[11px] font-semibold text-on-surface-variant mt-0.5 capitalize">
          {label}
        </div>

        {usingMood && (
          <div
            className={`grid grid-cols-3 gap-3 w-full text-center ${
              showArc ? "mt-3 max-w-[260px]" : "mt-3"
            }`}
          >
            {[
              { k: "Yesterday", v: dayDelta },
              { k: "1W ago", v: weekDelta },
              { k: "1M ago", v: monthDelta },
            ].map(({ k, v }) => (
              <div key={k} className="flex flex-col">
                <span className="text-[9px] uppercase tracking-[0.12em] text-on-surface-variant">
                  {k}
                </span>
                <span className="text-[12px] font-semibold tabular-nums text-on-surface">
                  {v ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {usingMood && mood && (
        <div className="mt-3 pt-3 border-t border-outline-variant text-[10px] text-on-surface-variant text-center">
          Source: {mood.source}
        </div>
      )}
    </>
  );
}

function Arc({ from, to, color }: { from: number; to: number; color: string }) {
  const radius = 80;
  const cx = 100;
  const cy = 100;
  const startAngle = Math.PI * (1 - from / 100);
  const endAngle = Math.PI * (1 - to / 100);
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy - radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy - radius * Math.sin(endAngle);
  return (
    <path
      d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
      stroke={color}
      strokeWidth="14"
      fill="none"
      strokeLinecap="butt"
    />
  );
}

// Simplified version for the hero card — just a one-line mood summary
export function MarketMoodSummary({
  gauge,
  mood,
  fallbackScore,
  fallbackLabel,
}: Omit<Props, "flows">) {
  const score = mood?.score ?? gauge?.score ?? fallbackScore ?? 50;
  const clamped = Math.max(0, Math.min(100, score));
  const { tone, color } = gaugeTone(clamped);

  const mocked = !gauge && !mood;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-on-surface">Market Mood</span>
        <span
          className="font-bold tracking-[-0.02em] tabular-nums leading-none text-[24px]"
          style={{ color }}
        >
          {Math.round(clamped)}
        </span>
        <span
          className="text-[11px] font-bold tracking-[0.15em] uppercase"
          style={{ color }}
        >
          {tone}
        </span>
      </div>
      {mocked && (
        <span
          title="Mocked — tm_sentiment_gauge not yet populated."
          className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
        >
          Mock
        </span>
      )}
    </div>
  );
}

export function FearGreedGauge({
  gauge,
  mood,
  flows,
  fallbackScore,
  fallbackLabel,
}: Props) {
  return (
    <div className="bg-surface-container-lowest brutalist-border rounded-xl p-6 flex flex-col h-full">
      <MarketMoodScore
        gauge={gauge}
        mood={mood}
        fallbackScore={fallbackScore}
        fallbackLabel={fallbackLabel}
        showArc
      />

      {flows && flows.flows?.length ? (
        <FlowsBlock flows={flows} />
      ) : null}
    </div>
  );
}

function FlowsBlock({ flows }: { flows: InstitutionalFlowsDoc }) {
  const rows = flows.flows;
  // Scale bars against the largest absolute flow so FII vs DII compare on the
  // same axis rather than each filling the track.
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.net_cr)));
  const head = flowsHeadline(rows);

  return (
    <div className="mt-5 pt-5 border-t border-outline-variant/40">
      <h3 className="text-[14px] font-semibold text-on-surface">Institutional Flows</h3>
      <p className="text-[11px] text-on-surface-variant leading-snug mt-1 mb-3">
        <strong className="text-on-surface">FII</strong> = foreign funds ·{" "}
        <strong className="text-on-surface">DII</strong> = domestic funds. When
        they disagree, the split tells you who's driving price.
      </p>

      <div className="mb-3 text-[14px] font-bold text-on-surface leading-tight">
        {head}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const cls = flowDirectionClasses(row.direction);
          const fraction = Math.min(1, Math.abs(row.net_cr) / maxAbs);
          const sign = row.net_cr >= 0 ? "+" : "−";
          return (
            <div key={row.category} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-on-surface">
                  {row.category}
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase rounded-sm ${cls.badge}`}>
                    {row.direction}
                  </span>
                </span>
                <span className={`text-[14px] font-bold tabular-nums ${cls.text}`}>
                  ₹{sign}{formatCr(Math.abs(row.net_cr))}
                </span>
              </div>
              <div className="relative h-1.5 bg-surface-container-high">
                <div
                  className={`absolute inset-y-0 ${row.net_cr >= 0 ? "left-1/2" : "right-1/2"} ${cls.bar}`}
                  style={{ width: `${fraction * 50}%` }}
                />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-on-surface/30" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                <span>Buy ₹{formatCr(row.buy_cr)}</span>
                <span>Sell ₹{formatCr(row.sell_cr)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[10px] text-on-surface-variant">
        {flows.source} · {flows.snapshot_date}
      </div>
    </div>
  );
}
