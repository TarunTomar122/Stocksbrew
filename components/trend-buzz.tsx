import type { TrendConvergence } from "@/lib/stock";

type Props = {
  trend: TrendConvergence | null | undefined;
};

function formatPrice(v: number): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rangeLabel(range?: string): string {
  switch ((range ?? "1W").toUpperCase()) {
    case "1D":
      return "past day";
    case "1W":
      return "past week";
    case "1M":
      return "past month";
    case "3M":
      return "past 3 months";
    case "6M":
      return "past 6 months";
    case "1Y":
      return "past year";
    default:
      return (range ?? "").toLowerCase();
  }
}

function PriceChart({ data }: { data: number[] }) {
  const width = 640;
  const height = 160;
  const padY = 8;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const innerH = height - padY * 2;
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const positive = data[data.length - 1] >= data[0];
  const color = positive ? "var(--signal-bullish)" : "var(--signal-bearish)";

  const pointFor = (v: number, i: number) => {
    const x = i * step;
    const y = padY + innerH - ((v - min) / range) * innerH;
    return { x, y };
  };

  const points = data
    .map((v, i) => {
      const { x, y } = pointFor(v, i);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPath =
    data
      .map((v, i) => {
        const { x, y } = pointFor(v, i);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ") + ` L ${width} ${height} L 0 ${height} Z`;

  const last = data[data.length - 1];
  const lastPoint = pointFor(last, data.length - 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[160px]"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaPath} fill={color} opacity="0.08" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill={color} />
    </svg>
  );
}

function MentionBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-1.5 h-[48px]">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/70"
          style={{
            height: `${(v / max) * 100}%`,
            minHeight: v > 0 ? "4px" : "2px",
            opacity: v > 0 ? 1 : 0.2,
          }}
          title={`${v} mentions`}
        />
      ))}
    </div>
  );
}

export function TrendBuzz({ trend }: Props) {
  const priceSeries = trend?.price_series ?? [];
  const mentionSeries = trend?.mention_volume_series ?? [];
  const mentionsTotal = mentionSeries.reduce((a, b) => a + b, 0);
  const rangeCode = (trend?.range ?? "1W").toUpperCase();

  if (!priceSeries.length) {
    return (
      <section className="bg-surface-container-lowest brutalist-border p-6">
        <h2 className="text-[14px] font-semibold text-on-surface mb-3">
          Price Trend
        </h2>
        <div className="text-[13px] text-on-surface-variant py-6 text-center">
          Not enough price history yet.
        </div>
      </section>
    );
  }

  const first = priceSeries[0];
  const last = priceSeries[priceSeries.length - 1];
  const delta = last - first;
  const pct = first > 0 ? (delta / first) * 100 : 0;
  const positive = delta >= 0;
  const sign = positive ? "+" : "";
  const toneClass = positive ? "text-signal-bullish" : "text-signal-bearish";
  const min = Math.min(...priceSeries);
  const max = Math.max(...priceSeries);

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h2 className="text-[14px] font-semibold text-on-surface">
            Price Trend
          </h2>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            How the stock moved over the {rangeLabel(rangeCode)}.
          </p>
        </div>
        <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
          {rangeCode}
        </span>
      </div>

      <div className="flex items-baseline gap-3 mt-4">
        <span className="text-[28px] font-bold tracking-tight text-on-surface tabular-nums leading-none">
          ${formatPrice(last)}
        </span>
        <span className={`text-[13px] font-bold tabular-nums ${toneClass}`}>
          {sign}${formatPrice(Math.abs(delta))} ({sign}
          {pct.toFixed(2)}%)
        </span>
      </div>
      <div className="text-[11px] text-on-surface-variant mt-1 tabular-nums">
        From ${formatPrice(first)} {rangeLabel(rangeCode)} ago
      </div>

      <div className="relative mt-4">
        <PriceChart data={priceSeries} />
        <div className="pointer-events-none absolute right-0 top-0 text-[10px] font-bold tracking-[0.1em] uppercase text-outline tabular-nums">
          High ${formatPrice(max)}
        </div>
        <div className="pointer-events-none absolute right-0 bottom-0 text-[10px] font-bold tracking-[0.1em] uppercase text-outline tabular-nums">
          Low ${formatPrice(min)}
        </div>
      </div>

    </section>
  );
}
