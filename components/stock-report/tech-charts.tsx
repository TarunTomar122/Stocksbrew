import { fin } from "./format";

/**
 * The Price trend tab's pictures: a price line with its averages or levels marked on it, the RSI gauge and the
 * returns as signed bars. Plain boxes and HTML text, no SVG, so labels stay 12px on a phone and every figure printed
 * beside its mark is the number itself (owner rule 6: plain numbers beat clever encodings).
 */

export type TrackMark = {
  key: string;
  value: number;
  /** What it is, a word or two: "50-day", "Support". */
  name: string;
  /** The figure as printed: "$96.18". Empty when the figure is printed beside the line instead. */
  text: string;
  color: string;
  /** "dot" is the thing being located (today's price); "tick" a reference level. */
  shape: "dot" | "tick";
};

/** Label rows above and below the line: first above, then below, then a second row below. */
const LANES = ["above", "below", "below2"] as const;
type Lane = (typeof LANES)[number];

/** A label's width in pixels at 12px: the longer of its two lines, plus room either side. */
function labelWidth(mark: TrackMark): number {
  return Math.max(mark.name.length * 6.4, mark.text ? mark.text.length * 7.4 : 0) + 10;
}

/**
 * Which row each label goes on for a line `width` pixels wide, so no two labels in a row overlap. A label sits at its
 * mark, shifted left by the same share of its own width as the mark's share of the line (left-aligned at the left end,
 * centred mid-way, right-aligned at the right end), so it never runs off either end. The dot (today's price) is
 * placed first and gets the row above to itself when it can. Exported for the tests.
 */
export function laneLabels(marks: Array<TrackMark & { at: number }>, width: number): Map<string, Lane> {
  const order = [...marks].sort((a, b) => (a.shape === "dot" ? -1 : b.shape === "dot" ? 1 : a.at - b.at));
  const taken: Record<Lane, Array<[number, number]>> = { above: [], below: [], below2: [] };
  const out = new Map<string, Lane>();
  for (const mark of order) {
    const w = labelWidth(mark);
    const left = (mark.at / 100) * width - (mark.at / 100) * w;
    const span: [number, number] = [left - 4, left + w + 4];
    const lane = LANES.find((name) => taken[name].every(([a, b]) => span[1] <= a || span[0] >= b)) ?? "below2";
    taken[lane].push(span);
    out.set(mark.key, lane);
  }
  return out;
}

function TrackLabels({ marks, lanes, lane }: { marks: Array<TrackMark & { at: number }>; lanes: Map<string, Lane>; lane: Lane }) {
  const here = marks.filter((mark) => lanes.get(mark.key) === lane);
  if (!here.length) return null;
  return (
    <div className="relative h-8" aria-hidden="true">
      {here.map((mark) => (
        <span
          key={mark.key}
          className="absolute top-0 flex flex-col whitespace-nowrap text-[12px] leading-4"
          style={{ left: `${mark.at}%`, transform: `translateX(-${mark.at}%)`, alignItems: mark.at < 12 ? "flex-start" : mark.at > 88 ? "flex-end" : "center" }}
        >
          {lane === "above" ? (
            <>
              <span className="text-oa-muted-fg">{mark.name}</span>
              {mark.text ? <span className={`oa-mono tabular-nums ${mark.shape === "dot" ? "font-semibold text-oa-fg" : "text-oa-fg"}`}>{mark.text}</span> : null}
            </>
          ) : (
            <>
              {mark.text ? <span className={`oa-mono tabular-nums ${mark.shape === "dot" ? "font-semibold text-oa-fg" : "text-oa-fg"}`}>{mark.text}</span> : null}
              <span className="text-oa-muted-fg">{mark.name}</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/** The labels for one assumed line width; two of these (phone and wider) are drawn and one shown. */
function TrackBody({
  marks,
  width,
  span,
  className,
}: {
  marks: Array<TrackMark & { at: number }>;
  width: number;
  span?: { from: number; to: number; color: string } | null;
  className: string;
}) {
  const lanes = laneLabels(marks, width);
  return (
    <div className={className}>
      <TrackLabels marks={marks} lanes={lanes} lane="above" />
      <div className="relative my-0.5 h-5" aria-hidden="true">
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-oa-secondary" />
        {span && span.to > span.from ? (
          <span
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
            style={{ left: `${span.from}%`, width: `${span.to - span.from}%`, background: span.color }}
          />
        ) : null}
        {marks
          .filter((mark) => mark.shape === "tick")
          .map((mark) => (
            <span
              key={mark.key}
              className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${mark.at}%`, background: mark.color }}
            />
          ))}
        {marks
          .filter((mark) => mark.shape === "dot")
          .map((mark) => (
            <span
              key={mark.key}
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-oa-card shadow-[0_0_0_1px_var(--oa-border)]"
              style={{ left: `${mark.at}%`, background: mark.color }}
            />
          ))}
      </div>
      <TrackLabels marks={marks} lanes={lanes} lane="below" />
      <TrackLabels marks={marks} lanes={lanes} lane="below2" />
    </div>
  );
}

/**
 * A price line from `low` to `high` with labelled marks on it: today's price as a dot, reference levels (averages,
 * support, resistance) as ticks, each with its name and figure beside it. `span` shades a stretch of the line (the
 * distance from the price to the 52-week high). `ends` names the two ends under the line. A mark outside the range
 * is pinned to the nearer end.
 */
export function MarkedTrack({
  low,
  high,
  marks,
  span,
  ends,
  widths = { phone: 300, wide: 540 },
  label,
}: {
  low: number;
  high: number;
  marks: TrackMark[];
  span?: { from: number; to: number; color: string } | null;
  ends?: { low: string; high: string; lowName: string; highName: string; highNote?: string | null } | null;
  /**
   * The line's width in pixels the labels are placed for: below 640px (`phone`) and from 640px up (`wide`). Give the
   * narrowest the line gets in each range, so labels never overlap; a line in a half-width panel stays near 300px.
   */
  widths?: { phone: number; wide: number };
  /** The sentence screen readers get. */
  label: string;
}) {
  if (!(high > low)) return null;
  const at = (value: number) => Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100));
  const placed = marks.filter((mark) => fin(mark.value)).map((mark) => ({ ...mark, at: at(mark.value) }));
  const shade = span ? { from: at(Math.min(span.from, span.to)), to: at(Math.max(span.from, span.to)), color: span.color } : null;
  return (
    <div role="img" aria-label={label}>
      {/* The labels' rows depend on the line's width, so they are placed for the narrowest it gets below and from 640px. */}
      {widths.phone === widths.wide ? (
        <TrackBody marks={placed} width={widths.phone} span={shade} className="" />
      ) : (
        <>
          <TrackBody marks={placed} width={widths.phone} span={shade} className="sm:hidden" />
          <TrackBody marks={placed} width={widths.wide} span={shade} className="hidden sm:block" />
        </>
      )}
      {ends ? (
        <div className="mt-1 flex items-start justify-between gap-3 border-t border-dashed border-oa-border pt-1.5 text-[12px] leading-4" aria-hidden="true">
          <span className="flex shrink-0 flex-col">
            <span className="oa-mono tabular-nums text-oa-fg">{ends.low}</span>
            <span className="text-oa-muted-fg">{ends.lowName}</span>
          </span>
          <span className="flex flex-col items-end text-right">
            <span className="oa-mono tabular-nums text-oa-fg">{ends.high}</span>
            <span className="text-oa-muted-fg">{ends.highName}</span>
            {ends.highNote ? <span className="text-oa-muted-fg">{ends.highNote}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** RSI on its 0 to 100 scale: the 30 to 70 middle shaded, the value as a dot, 30 and 70 named under the bar. */
export function RsiGauge({ value, color }: { value: number; color: string }) {
  if (!fin(value)) return null;
  const at = Math.max(0, Math.min(100, value));
  return (
    <div aria-hidden="true">
      <div className="relative h-5">
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-oa-secondary" />
        <span className="absolute top-1/2 h-2 -translate-y-1/2 bg-oa-fg/15" style={{ left: "30%", width: "40%" }} />
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-oa-card shadow-[0_0_0_1px_var(--oa-border)]"
          style={{ left: `${at}%`, background: color }}
        />
      </div>
      <div className="relative mt-0.5 h-4 text-[11px] leading-4 tabular-nums text-oa-muted-fg">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: "30%" }}>
          30
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: "70%" }}>
          70
        </span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

/**
 * Returns as one signed bar each on a shared zero line, losses left of it in red, gains right in green, the figure at
 * the end of the row. Bar lengths are linear, or logarithmic when a figure passes 250% (see below); the order and sign
 * are kept either way and the figure is always printed.
 */
export function ReturnBars({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number; title?: string }>;
  format: (value: number) => string;
}) {
  const kept = rows.filter((row) => fin(row.value));
  if (!kept.length) return null;
  // Linear while the figures are of a size (a year's moves); once a multi-year figure runs into the hundreds of percent,
  // a log scale, so +7,950% over ten years does not flatten a month's −19% to a sliver.
  const wide = Math.max(...kept.map((row) => Math.abs(row.value))) > 250;
  const scaled = (value: number) => (wide ? Math.sign(value) * Math.log10(1 + Math.abs(value) / 10) : value);
  const neg = Math.max(0, ...kept.map((row) => -scaled(row.value)));
  const pos = Math.max(0, ...kept.map((row) => scaled(row.value)));
  const total = neg + pos || 1;
  const zero = (neg / total) * 100;
  return (
    <ul className="flex h-full flex-col" aria-label={kept.map((row) => `${row.label} ${format(row.value)}`).join(", ")}>
      {kept.map((row) => {
        const width = (Math.abs(scaled(row.value)) / total) * 100;
        const up = row.value >= 0;
        return (
          <li
            key={row.label}
            title={row.title}
            className="grid min-h-9 flex-1 grid-cols-[4.75rem_minmax(0,1fr)_4.25rem] items-center gap-x-3 border-b border-oa-border px-3.5 py-1.5 text-[14px] leading-5 last:border-b-0 sm:px-4"
          >
            <span className="truncate text-oa-muted-fg">{row.label}</span>
            <span aria-hidden="true" className="relative h-3">
              <span className="absolute inset-y-[-3px] w-px bg-oa-fg/40" style={{ left: `${zero}%` }} />
              <span
                className={`absolute inset-y-0 ${up ? "rounded-r-[3px]" : "rounded-l-[3px]"}`}
                style={{
                  left: up ? `${zero}%` : `${zero - width}%`,
                  width: `max(${width}%, 2px)`,
                  background: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
                  opacity: 0.85,
                }}
              />
            </span>
            <span className={`oa-mono text-right tabular-nums ${up ? "text-signal-bullish" : "text-signal-bearish"}`}>{format(row.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
