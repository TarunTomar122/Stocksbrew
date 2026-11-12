import Link from "next/link";

import type { RiskModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { ChartCard, FigureStrip, Key, MINE, Module, NUM, SP, SPAN, day, monthName, pct, signedPct } from "./parts";

/**
 * What drives the swings: three figures in one strip across the page (how far the mix moves when the S&P 500 moves
 * 1%, how much it goes up and down in a year, its largest fall), then the year as two lines with that fall marked
 * (8 columns) beside each holding's weight against its share of the swings (4), the two charts ending level.
 */
export function Swings({ module, example }: { module: RiskModule; example: boolean }) {
  const subject = example ? "This mix" : "Your mix";
  // A recent listing can shorten the shared window; the words follow the dates rather than promise a year.
  const span = module.sessions >= 240 ? "this past year" : `since ${day(module.from)}`;
  const scatter = module.shares.length > 1;
  return (
    <Module id="swings" title="What drives the swings">
      <FigureStrip
        label="How the mix swings"
        className={SPAN[12]}
        cols="grid-cols-1 sm:grid-cols-3"
        cells={[
          { key: "beta", label: "When the S&P 500 moves 1%", figure: `${module.sensitivity.toFixed(1)}%`, line: `${subject} tends to move this much` },
          // Each against the S&P 500's own as two bars on one scale (owner VISUALS CHECK).
          {
            key: "swing",
            label: "Up and down in a year",
            figure: pct(module.swing),
            pair: { value: module.swing, versus: module.spSwing, labels: ["Mix", "S&P"], texts: [pct(module.swing), pct(module.spSwing)] },
          },
          {
            key: "fall",
            label: `Largest fall ${span}`,
            figure: pct(module.worstDrop.pct),
            tone: module.worstDrop.pct,
            line: module.worstDrop.pct < 0 ? `${day(module.worstDrop.peak)} to ${day(module.worstDrop.trough)}` : undefined,
            pair: {
              value: module.worstDrop.pct,
              versus: module.spWorstDrop.pct,
              labels: ["Mix", "S&P"],
              texts: [pct(module.worstDrop.pct), pct(module.spWorstDrop.pct)],
            },
          },
        ]}
      />
      <PathChart
        module={module}
        title={module.sessions >= 240 ? "Today's mix, past year" : `Today's mix ${span}`}
        className={scatter ? `${SPAN[8]} lg:self-stretch` : SPAN[12]}
      />
      {scatter ? <Scatter module={module} /> : null}
    </Module>
  );
}

/** Gridline steps for the path chart, in points of change from the start: the first that gives at most four lines. */
const STEPS = [2, 5, 10, 20, 25, 50, 100];

/**
 * The year as two lines. The lines are drawn in a 0-100 box stretched to the card (the strokes keep their width), and
 * every word on the chart is HTML placed by percent, so nothing is squashed at any width: the change gridlines on
 * the left, the month under each month's first session, the fall's size inside its shading.
 */
function PathChart({ module, title, className }: { module: RiskModule; title: string; className: string }) {
  const { book, sp, dates } = module.path;
  const all = [...book, ...sp];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const y = (value: number) => 100 - ((value - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const x = (index: number) => (index / Math.max(1, book.length - 1)) * 100;
  const line = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join("");
  const peak = dates.indexOf(module.worstDrop.peak);
  const trough = dates.indexOf(module.worstDrop.trough);
  const endBook = book[book.length - 1]! - 100;
  const endSp = sp[sp.length - 1]! - 100;
  const marked = peak >= 0 && trough > peak && module.worstDrop.pct <= -1;
  const step = STEPS.find((candidate) => (hi - lo + 2 * pad) / candidate <= 4) ?? 100;
  const ticks: number[] = [];
  for (let tick = Math.ceil((lo - pad - 100) / step) * step; tick <= hi + pad - 100; tick += step) ticks.push(tick);
  // A month label under the first session of each month, except one squeezed against either edge.
  const months = dates
    .map((date, index) => ({ date, index }))
    .filter(({ date, index }) => index > 0 && date.slice(0, 7) !== dates[index - 1]!.slice(0, 7))
    .filter(({ index }) => x(index) > 3 && x(index) < 97);
  return (
    <ChartCard
      title={title}
      className={className}
      aside={
        <>
          <Key color={MINE} line>
            You <span className={NUM}>{signedPct(endBook)}</span>
          </Key>
          <Key color={SP} line>
            S&amp;P 500 <span className={NUM}>{signedPct(endSp)}</span>
          </Key>
        </>
      }
    >
      {/* Beside the scatter both charts take the row's height (self-stretch), the plot growing into it. */}
      <div className="relative h-[220px] pl-10 lg:h-auto lg:min-h-[260px] lg:flex-1">
        {ticks.map((tick) => (
          <span
            key={tick}
            className={`${NUM} absolute left-0 w-9 -translate-y-1/2 text-right text-[11px] leading-3 text-oa-muted-fg`}
            style={{ top: `${y(tick + 100)}%` }}
          >
            {tick === 0 ? "0%" : signedPct(tick, 0)}
          </span>
        ))}
        <div className="relative h-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 block h-full w-full" role="img" aria-label={`Today's mix ${signedPct(endBook)} from ${day(module.from, true)} to ${day(module.to, true)}, the S&P 500 ${signedPct(endSp)}; the largest fall was ${pct(module.worstDrop.pct)}`}>
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2="100"
                y1={y(tick + 100)}
                y2={y(tick + 100)}
                stroke="var(--oa-border)"
                strokeDasharray={tick === 0 ? "3 4" : undefined}
                strokeOpacity={tick === 0 ? 1 : 0.6}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {marked ? <rect x={x(peak)} y="0" width={Math.max(0.4, x(trough) - x(peak))} height="100" fill="color-mix(in srgb, var(--signal-bearish) 10%, transparent)" /> : null}
            <path d={line(sp)} fill="none" stroke={SP} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <path d={line(book)} fill="none" stroke={MINE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          {marked ? (
            <span
              className={`${NUM} pointer-events-none absolute -translate-x-1/2 translate-y-1 rounded bg-oa-card px-1 text-[12px] font-medium text-[color:var(--signal-bearish)]`}
              style={{ left: `${Math.min(92, Math.max(8, (x(peak) + x(trough)) / 2))}%`, top: `${Math.min(84, y(book[trough]!))}%` }}
            >
              {pct(module.worstDrop.pct)}
            </span>
          ) : null}
        </div>
      </div>
      {/* Month labels right under the line, every other one on a phone. */}
      <div className="relative ml-10 mt-1.5 h-4" aria-hidden="true">
        {months.map(({ date, index }, n) => (
          <span
            key={date}
            className={`${NUM} absolute -translate-x-1/2 whitespace-nowrap text-[11px] leading-4 text-oa-muted-fg ${n % 2 === 1 ? "max-sm:hidden" : ""}`}
            style={{ left: `${x(index)}%` }}
          >
            {date.slice(5, 7) === "01" ? date.slice(0, 4) : monthName(date)}
          </span>
        ))}
      </div>
    </ChartCard>
  );
}

/** The scatter's plot box at its usual size (4 of 12 columns, 260px tall), for placing the ticker labels. */
const PLOT = { w: 320, h: 236 };
const LOGO = 18;

export type ScatterLabel = { ticker: string; side: "right" | "left" | "above" | "below" };

/**
 * Which dots get their ticker written beside the logo, and on which side: the six biggest by size and swing, each on
 * the first side (right, left, above, below) that stays inside the plot and clear of every logo and label already
 * placed. A dot with no free side keeps only its logo (the figures are in its hover title). `x` and `y` are 0-100,
 * from the left and from the bottom.
 */
export function placeLabels(points: { ticker: string; x: number; y: number; size: number }[], count = 6): ScatterLabel[] {
  type Box = [number, number, number, number];
  const centre = (point: { x: number; y: number }) => [(point.x / 100) * PLOT.w, (1 - point.y / 100) * PLOT.h] as const;
  const taken: Box[] = points.map((point) => {
    const [cx, cy] = centre(point);
    return [cx - LOGO / 2, cy - LOGO / 2, cx + LOGO / 2, cy + LOGO / 2];
  });
  // A label keeps a few pixels from every other logo and label, so it never reads as belonging to the neighbour.
  const GAP = 4;
  const clear = (box: Box, own: Box) =>
    box[0] >= 0 &&
    box[2] <= PLOT.w &&
    box[1] >= 0 &&
    box[3] <= PLOT.h &&
    taken.every((other) => other === own || box[2] + GAP <= other[0] || box[0] - GAP >= other[2] || box[3] + GAP <= other[1] || box[1] - GAP >= other[3]);
  const out: ScatterLabel[] = [];
  const ranked = points.map((point, index) => ({ point, own: taken[index]! })).sort((a, b) => b.point.size - a.point.size);
  for (const { point, own } of ranked.slice(0, count)) {
    const [cx, cy] = centre(point);
    const w = point.ticker.length * 7 + 4;
    const h = 14;
    const options: [ScatterLabel["side"], Box][] = [
      ["right", [cx + LOGO / 2 + 3, cy - h / 2, cx + LOGO / 2 + 3 + w, cy + h / 2]],
      ["left", [cx - LOGO / 2 - 3 - w, cy - h / 2, cx - LOGO / 2 - 3, cy + h / 2]],
      ["above", [cx - w / 2, cy - LOGO / 2 - 2 - h, cx + w / 2, cy - LOGO / 2 - 2]],
      ["below", [cx - w / 2, cy + LOGO / 2 + 2, cx + w / 2, cy + LOGO / 2 + 2 + h]],
    ];
    const pick = options.find(([, box]) => clear(box, own));
    if (!pick) continue;
    taken.push(pick[1]);
    out.push({ ticker: point.ticker, side: pick[0] });
  }
  return out;
}

const SIDE: Record<ScatterLabel["side"], string> = {
  right: "left-full top-1/2 ml-[3px] -translate-y-1/2",
  left: "right-full top-1/2 mr-[3px] -translate-y-1/2",
  above: "bottom-full left-1/2 mb-0.5 -translate-x-1/2",
  below: "top-full left-1/2 mt-0.5 -translate-x-1/2",
};

/**
 * Weight against share of the swings, on one scale, so the dashed diagonal is "swings as much as its size". Every
 * dot is the holding's logo; the biggest also carry their ticker where it fits.
 */
function Scatter({ module }: { module: RiskModule }) {
  const points = module.shares;
  const lo = Math.min(0, ...points.map((point) => point.share));
  const hi = Math.max(...points.map((point) => Math.max(point.weight, point.share))) * 1.08;
  const at = (value: number) => ((value - lo) / (hi - lo)) * 100;
  const labels = new Map(
    placeLabels(points.map((point) => ({ ticker: point.ticker, x: at(point.weight), y: at(point.share), size: point.weight + Math.abs(point.share) }))).map((label) => [label.ticker, label.side]),
  );
  return (
    <ChartCard title="Size against share of the swings" aside={<span>above the line: more swing than size</span>} className={`${SPAN[4]} lg:self-stretch`}>
      <p className="mb-1 text-[11.5px] leading-4 text-oa-muted-fg">share of swings</p>
      <div className="relative ml-1 mr-2 h-[220px] border-b border-l border-oa-border lg:h-auto lg:min-h-[236px] lg:flex-1">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <line x1={at(lo)} y1={100 - at(lo)} x2="100" y2={100 - at(hi)} stroke="var(--oa-border)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((point) => {
          const side = labels.get(point.ticker);
          return (
            <Link
              key={point.ticker}
              href={`/stock/${encodeURIComponent(point.ticker)}`}
              prefetch={false}
              className="absolute -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-oa-card hover:z-10 hover:ring-oa-primary"
              style={{ left: `${at(point.weight)}%`, bottom: `${at(point.share)}%` }}
              title={`${point.ticker}: ${pct(point.weight)} of the money, ${pct(point.share)} of the swings`}
            >
              <StockLogo ticker={point.ticker} size={LOGO} atOnce circle />
              {side ? <span className={`${NUM} pointer-events-none absolute whitespace-nowrap text-[11.5px] leading-[14px] text-oa-fg ${SIDE[side]}`}>{point.ticker}</span> : null}
            </Link>
          );
        })}
      </div>
      <div className="ml-1 mr-2 mt-1 flex justify-between text-[11.5px] text-oa-muted-fg">
        <span className={NUM}>0%</span>
        <span>share of money</span>
      </div>
    </ChartCard>
  );
}
