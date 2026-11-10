import { fin } from "./format";

/**
 * House charts for the stock report. All server-rendered, no chart library.
 *
 * Small multiples and range tracks. The price chart itself is the client
 * component in `price-panel.tsx`.
 *
 * Lines are inline SVG stretched to the box (`preserveAspectRatio="none"` with
 * non-scaling strokes), and every piece of text is HTML positioned over it, so
 * labels stay 12px on a phone instead of shrinking with the viewBox. Bars are
 * plain boxes for the same reason: rounded corners survive any width.
 */

/** Vertical bars for one measure across periods. The latest period is solid. */
export function MiniBars({
  rows,
  format,
  color = "var(--oa-primary)",
  heightClass = "h-24",
}: {
  rows: Array<{ label: string; value: number | null | undefined }>;
  format: (value: number) => string;
  color?: string;
  heightClass?: string;
}) {
  const values = rows.map((row) => (fin(row.value) ? row.value : null));
  const present = values.filter(fin);
  if (present.length < 2) return null;
  const maxPos = Math.max(0, ...present);
  const maxNeg = Math.max(0, ...present.map((value) => -value));
  const total = maxPos + maxNeg || 1;
  const zero = (maxNeg / total) * 100;
  const lastIndex = values.reduce<number>((acc, value, index) => (value != null ? index : acc), -1);

  return (
    <div
      className="grid gap-x-1.5"
      style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
      role="img"
      aria-label={rows.map((row, index) => `${row.label}: ${values[index] != null ? format(values[index]!) : "not available"}`).join(", ")}
    >
      {rows.map((row, index) => {
        const value = values[index];
        const isLast = index === lastIndex;
        return (
          <div key={row.label} className="flex min-w-0 flex-col items-center" aria-hidden="true">
            <span className={`mb-1 h-4 whitespace-nowrap text-[11px] leading-4 tabular-nums ${isLast ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>
              {value != null ? format(value) : ""}
            </span>
            <div className={`relative w-full ${heightClass}`}>
              {maxNeg > 0 ? <span className="absolute inset-x-0 h-px bg-oa-border" style={{ bottom: `${zero}%` }} /> : null}
              {value != null ? (
                <span
                  className="absolute inset-x-[14%] min-h-[2px]"
                  style={{
                    ...(value >= 0
                      ? { bottom: `${zero}%`, borderRadius: "4px 4px 0 0" }
                      : { top: `${100 - zero}%`, borderRadius: "0 0 4px 4px" }),
                    height: `${(Math.abs(value) / total) * 100}%`,
                    background: value < 0 ? "var(--signal-bearish)" : color,
                    opacity: isLast ? 1 : 0.32,
                  }}
                />
              ) : null}
            </div>
            <span className="mt-1.5 w-full truncate border-t border-oa-border pt-1.5 text-center text-[11px] leading-4 text-oa-muted-fg">
              {row.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type LineSeries = { key: string; label: string; color: string; values: Array<number | null | undefined> };

/** Up to three lines across the same periods, with the latest value in the legend. */
export function MiniLines({
  periods,
  series,
  format,
  heightClass = "h-24",
}: {
  periods: string[];
  series: LineSeries[];
  format: (value: number) => string;
  heightClass?: string;
}) {
  const all = series.flatMap((item) => item.values).filter(fin);
  if (all.length < 2 || periods.length < 2) return null;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo > 0) lo = 0;
  const pad = (hi - lo) * 0.1 || 1;
  hi += pad;
  if (lo < 0) lo -= pad;
  const n = periods.length;
  const x = (index: number) => ((index + 0.5) / n) * 100;
  const y = (value: number) => ((hi - value) / (hi - lo)) * 100;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((item) => {
          const latest = [...item.values].reverse().find(fin);
          return (
            <span key={item.key} className="inline-flex items-center gap-1.5 text-[12px] leading-5 text-oa-muted-fg">
              <span aria-hidden="true" className="h-[3px] w-3 rounded-full" style={{ background: item.color }} />
              {item.label}
              {latest != null ? <span className="font-medium tabular-nums text-oa-fg">{format(latest)}</span> : null}
            </span>
          );
        })}
      </div>
      <div
        className={`relative w-full ${heightClass}`}
        role="img"
        aria-label={series
          .map((item) => `${item.label}: ${periods.map((period, index) => `${period} ${fin(item.values[index]) ? format(item.values[index] as number) : "not available"}`).join(", ")}`)
          .join(". ")}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--oa-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {series.map((item) => {
            let d = "";
            let pen = false;
            item.values.forEach((value, index) => {
              if (!fin(value)) {
                pen = false;
                return;
              }
              d += `${pen ? "L" : "M"}${x(index).toFixed(2)},${y(value).toFixed(2)} `;
              pen = true;
            });
            return (
              <path key={item.key} d={d} fill="none" stroke={item.color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            );
          })}
        </svg>
        {series.map((item) => {
          const lastIndex = item.values.reduce<number>((acc, value, index) => (fin(value) ? index : acc), -1);
          if (lastIndex < 0) return null;
          return (
            <span
              key={`${item.key}-dot`}
              aria-hidden="true"
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-oa-card"
              style={{ left: `${x(lastIndex)}%`, top: `${y(item.values[lastIndex] as number)}%`, background: item.color }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 grid border-t border-oa-border pt-1.5" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden="true">
        {periods.map((period) => (
          <span key={period} className="truncate text-center text-[11px] leading-4 text-oa-muted-fg">
            {period}
          </span>
        ))}
      </div>
    </div>
  );
}

export type RangeMarker = {
  key: string;
  value: number;
  color: string;
  /** "dot" is the thing being located (today's price); "tick" is a reference. */
  shape: "dot" | "tick";
  label: string;
};

/**
 * A low-to-high track with markers placed by value. Labels live in the legend
 * the caller renders underneath, so markers can sit close together without
 * colliding. A value outside the range is pinned to the nearest end.
 */
export function RangeTrack({
  low,
  high,
  markers,
  format,
  surface = "card",
}: {
  low: number;
  high: number;
  markers: RangeMarker[];
  format: (value: number) => string;
  /** The background the track sits on, so the dot's halo matches it. */
  surface?: "card" | "stage";
}) {
  if (!(high > low)) return null;
  const pct = (value: number) => Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
  const halo = surface === "stage" ? "border-oa-bg" : "border-oa-card";
  return (
    <div
      role="img"
      aria-label={`Range ${format(low)} to ${format(high)}. ${markers.map((marker) => `${marker.label} ${format(marker.value)}`).join(", ")}.`}
    >
      <div className="relative h-6" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-oa-secondary" />
        {markers
          .filter((marker) => marker.shape === "tick")
          .map((marker) => (
            <span
              key={marker.key}
              className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${pct(marker.value)}%`, background: marker.color }}
            />
          ))}
        {markers
          .filter((marker) => marker.shape === "dot")
          .map((marker) => (
            <span
              key={marker.key}
              className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] ${halo} shadow-[0_0_0_1px_var(--oa-border)]`}
              style={{ left: `${pct(marker.value)}%`, background: marker.color }}
            />
          ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] leading-5 tabular-nums text-oa-muted-fg" aria-hidden="true">
        <span>{format(low)}</span>
        <span>{format(high)}</span>
      </div>
    </div>
  );
}

/** Horizontal bars for parts of a whole (revenue by segment or by country). */
export function ShareBars({
  items,
  formatValue,
  color = "var(--oa-primary)",
}: {
  items: Array<{ name: string; sharePct: number; value?: number | null }>;
  formatValue?: (value: number) => string;
  color?: string;
}) {
  const rows = items.filter((item) => fin(item.sharePct) && item.sharePct > 0);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => row.sharePct));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row, index) => (
        <li key={row.name} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-[14px] leading-5">
            <span className="min-w-0 truncate text-oa-fg">{row.name}</span>
            <span className="shrink-0 tabular-nums text-oa-muted-fg">
              {fin(row.value) && formatValue ? <>{formatValue(row.value)} · </> : null}
              <span className="font-medium text-oa-fg">{row.sharePct.toFixed(row.sharePct >= 10 ? 0 : 1)}%</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-oa-secondary" aria-hidden="true">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(row.sharePct / max) * 100}%`, background: color, opacity: index === 0 ? 1 : 0.45 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Two amounts side by side on one scale (cash against debt). */
export function CompareBars({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number; color: string }>;
  format: (value: number) => string;
}) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 0);
  if (!(max > 0)) return null;
  return (
    <ul className="flex flex-col gap-3" aria-label={rows.map((row) => `${row.label} ${format(row.value)}`).join(", ")}>
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-[14px] leading-5">
            <span className="text-oa-muted-fg">{row.label}</span>
            <span className="font-medium tabular-nums text-oa-fg">{format(row.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-oa-secondary" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (Math.abs(row.value) / max) * 100)}%`, background: row.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Stacked columns of buy / hold / sell ratings by month. */
export function RatingColumns({
  months,
}: {
  months: Array<{ label: string; buy: number; hold: number; sell: number }>;
}) {
  const rows = months.filter((month) => month.buy + month.hold + month.sell > 0);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.map((row) => row.buy + row.hold + row.sell));
  return (
    <div
      className="grid gap-x-1.5"
      style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
      role="img"
      aria-label={rows.map((row) => `${row.label}: ${row.buy} buy, ${row.hold} hold, ${row.sell} sell`).join("; ")}
    >
      {rows.map((row) => {
        const total = row.buy + row.hold + row.sell;
        return (
          <div key={row.label} className="flex min-w-0 flex-col items-center" aria-hidden="true">
            <span className="mb-1 text-[11px] leading-4 tabular-nums text-oa-muted-fg">{total}</span>
            <div className="flex h-20 w-full flex-col justify-end">
              <div className="mx-[14%] flex flex-col overflow-hidden rounded-t-[4px]" style={{ height: `${(total / max) * 100}%` }}>
                {row.sell > 0 ? <span style={{ flexGrow: row.sell, background: "var(--signal-bearish)" }} /> : null}
                {row.hold > 0 ? <span style={{ flexGrow: row.hold, background: "color-mix(in srgb, var(--oa-fg) 22%, transparent)" }} /> : null}
                {row.buy > 0 ? <span style={{ flexGrow: row.buy, background: "var(--signal-bullish)" }} /> : null}
              </div>
            </div>
            <span className="mt-1.5 w-full truncate border-t border-oa-border pt-1.5 text-center text-[11px] leading-4 text-oa-muted-fg">
              {row.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A bare line for a stored series (P/E by day). No axis: the caller prints low, high and latest beside it. */
export function Spark({
  values,
  color = "var(--oa-primary)",
  heightClass = "h-14",
  label,
  reference,
}: {
  values: number[];
  color?: string;
  heightClass?: string;
  /** Sentence for screen readers. */
  label: string;
  /** A level drawn across the chart, e.g. the median. */
  reference?: number | null;
}) {
  const points = values.filter(fin);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const y = (value: number) => 6 + ((max - value) / span) * 88;
  const x = (index: number) => (index / (points.length - 1)) * 100;
  const d = points.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const last = points[points.length - 1]!;
  return (
    <div className={`relative w-full ${heightClass}`} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {fin(reference) && reference >= min && reference <= max ? (
          <line x1="0" x2="100" y1={y(reference)} y2={y(reference)} stroke="var(--oa-muted-fg)" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ) : null}
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        aria-hidden="true"
        className="absolute right-0 size-2 -translate-y-1/2 translate-x-1/2 rounded-full border border-oa-card"
        style={{ top: `${y(last)}%`, background: color }}
      />
    </div>
  );
}
