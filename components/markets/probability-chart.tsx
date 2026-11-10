import { formatDay, formatProbability, type PredictionHistorySeries } from "@/lib/markets-shared";

const COLORS = ["var(--oa-primary)", "var(--oa-fg)", "var(--oa-muted-fg)"];
const HEIGHT = 220;

function dayMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/**
 * Daily probability of a market's leading outcomes over time. Lines share a
 * real time axis, so an outcome that started trading later starts later.
 */
export function ProbabilityChart({ series }: { series: PredictionHistorySeries[] }) {
  const lines = series.filter((item) => item.dates.length >= 2).slice(0, COLORS.length);
  if (lines.length === 0) {
    return (
      <div className="oa-surface border border-oa-border bg-oa-card px-3.5 py-8 text-center text-[14px] text-oa-muted-fg">
        The venue has no daily history for this market yet.
      </div>
    );
  }
  const start = Math.min(...lines.map((item) => dayMs(item.dates[0])));
  const end = Math.max(...lines.map((item) => dayMs(item.dates[item.dates.length - 1])));
  const all = lines.flatMap((item) => item.values);
  const min = Math.max(0, Math.floor((Math.min(...all) * 100) / 10) * 10 - 0) / 100;
  const max = Math.min(100, Math.ceil((Math.max(...all) * 100) / 10) * 10 || 10) / 100;
  const span = max - min || 0.1;
  const x = (iso: string) => (end > start ? ((dayMs(iso) - start) / (end - start)) * 100 : 50);
  const y = (value: number) => (1 - (value - min) / span) * 100;
  const ticks = [max, min + span / 2, min];
  const startIso = new Date(start).toISOString().slice(0, 10);
  const endIso = new Date(end).toISOString().slice(0, 10);

  return (
    <div className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b border-oa-border px-3.5 py-2">
        {lines.map((item, index) => (
          <li key={item.label} className="oa-mono flex min-w-0 items-center gap-1.5 text-[12.5px] leading-5 tabular-nums text-oa-fg">
            <span aria-hidden="true" className="inline-block h-0.5 w-4 shrink-0" style={{ background: COLORS[index] }} />
            <span className="truncate">{item.label}</span>
            <span className="text-oa-muted-fg">{formatProbability(item.values[item.values.length - 1])}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3.5 pb-2 pt-3">
        <div
          className="relative"
          style={{ height: HEIGHT }}
          role="img"
          aria-label={`Probability history from ${formatDay(startIso, true)} to ${formatDay(endIso, true)}: ${lines
            .map((item) => `${item.label} now ${formatProbability(item.values[item.values.length - 1])}`)
            .join(", ")}`}
        >
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
            {ticks.map((tick) => (
              <line key={tick} x1={0} x2={100} y1={y(tick)} y2={y(tick)} stroke="var(--oa-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {[...lines].reverse().map((item) => {
              const index = lines.indexOf(item);
              const d = item.values
                .map((value, position) => `${position === 0 ? "M" : "L"}${x(item.dates[position]).toFixed(2)},${y(value).toFixed(2)}`)
                .join(" ");
              return (
                <path
                  key={item.label}
                  d={d}
                  stroke={COLORS[index]}
                  strokeWidth={index === 0 ? 1.8 : 1.3}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        </div>
        <div className="relative w-9" style={{ height: HEIGHT }}>
          {ticks.map((tick) => (
            <span key={tick} className="oa-mono absolute left-0 -translate-y-1/2 text-[12.5px] leading-none tabular-nums text-oa-muted-fg" style={{ top: `${y(tick)}%` }}>
              {Math.round(tick * 100)}%
            </span>
          ))}
        </div>
        <div className="oa-mono mt-1.5 flex justify-between text-[12.5px] uppercase tracking-[0.06em] tabular-nums text-oa-muted-fg">
          <span>{formatDay(startIso, true)}</span>
          <span>{formatDay(endIso, true)}</span>
        </div>
        <div />
      </div>
    </div>
  );
}
