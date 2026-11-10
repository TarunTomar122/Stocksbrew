import { SERIES_VARS } from "./format";

/** A tiny two-line chart for a directory row. Decorative: the numbers sit beside it. */
export function Sparkline({
  strategy,
  benchmark,
  width = 132,
  height = 36,
  log = true,
}: {
  strategy: number[];
  benchmark: number[];
  width?: number;
  height?: number;
  log?: boolean;
}) {
  const all = [...strategy, ...benchmark].filter((value) => value > 0);
  if (strategy.length < 2 || all.length < 2) return null;
  const scale = (value: number) => (log ? Math.log(value) : value);
  const low = scale(Math.min(...all));
  const high = scale(Math.max(...all));
  const span = high - low || 1;
  const path = (values: number[]) =>
    values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * (width - 4) + 2;
        const y = height - 3 - ((scale(value) - low) / span) * (height - 6);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join("");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className={`${SERIES_VARS} block shrink-0`}
    >
      <path d={path(benchmark)} fill="none" stroke="var(--series-b)" strokeWidth="1.25" strokeDasharray="3 2.5" opacity="0.9" />
      <path d={path(strategy)} fill="none" stroke="var(--series-a)" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
