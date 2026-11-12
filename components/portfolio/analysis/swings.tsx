import type { RiskModule } from "@/lib/portfolio-analysis/types";
import { StockLogo } from "@/components/stock-logo";

import { ChartCard, FigureCard, Key, MINE, Module, NUM, SP, day, pct, signedPct } from "./parts";

/**
 * What drives the swings: three figures in plain words (how far the mix moves when the S&P 500 moves 1%, how much it
 * goes up and down in a year, its largest fall), the year as two lines with that fall marked, and each holding's
 * weight against its share of the swings.
 */
export function Swings({ module, example }: { module: RiskModule; example: boolean }) {
  const subject = example ? "This mix" : "Your mix";
  // A recent listing can shorten the shared window; the words follow the dates rather than promise a year.
  const span = module.sessions >= 240 ? "this past year" : `since ${day(module.from)}`;
  return (
    <Module id="swings" title="What drives the swings">
      <FigureCard
        label="When the S&P 500 moves 1%"
        figure={`${module.sensitivity.toFixed(1)}%`}
        line={`${subject} tends to move this much`}
      />
      <FigureCard label="Up and down in a year" figure={pct(module.swing)} line={`The S&P 500: ${pct(module.spSwing)}`} />
      <FigureCard
        label={`Largest fall ${span}`}
        figure={pct(module.worstDrop.pct)}
        tone={module.worstDrop.pct}
        line={
          module.worstDrop.pct < 0
            ? `${day(module.worstDrop.peak)} to ${day(module.worstDrop.trough)}. The S&P 500: ${pct(module.spWorstDrop.pct)}`
            : `The S&P 500: ${pct(module.spWorstDrop.pct)}`
        }
      />
      <PathChart module={module} title={module.sessions >= 240 ? "Today's mix, past year" : `Today's mix ${span}`} />
      {module.shares.length > 1 ? <Scatter module={module} /> : null}
    </Module>
  );
}

const W = 600;
const H = 180;

function PathChart({ module, title }: { module: RiskModule; title: string }) {
  const { book, sp, dates } = module.path;
  const all = [...book, ...sp];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const y = (value: number) => H - ((value - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  const x = (index: number) => (index / Math.max(1, book.length - 1)) * W;
  const line = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("");
  const peak = dates.indexOf(module.worstDrop.peak);
  const trough = dates.indexOf(module.worstDrop.trough);
  const endBook = book[book.length - 1]! - 100;
  const endSp = sp[sp.length - 1]! - 100;
  const marked = peak >= 0 && trough > peak && module.worstDrop.pct <= -1;
  return (
    <ChartCard
      title={title}
      newRow
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
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[180px] w-full" role="img" aria-label={`Today's mix ${signedPct(endBook)} over the year, the S&P 500 ${signedPct(endSp)}; the largest fall was ${pct(module.worstDrop.pct)}`}>
          <line x1="0" x2={W} y1={y(100)} y2={y(100)} stroke="var(--oa-border)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {marked ? <rect x={x(peak)} y="0" width={Math.max(2, x(trough) - x(peak))} height={H} fill="color-mix(in srgb, var(--signal-bearish) 10%, transparent)" /> : null}
          <path d={line(sp)} fill="none" stroke={SP} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={line(book)} fill="none" stroke={MINE} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {marked ? (
          <span
            className={`${NUM} pointer-events-none absolute -translate-x-1/2 translate-y-1 rounded bg-oa-card px-1 text-[12px] font-medium text-[color:var(--signal-bearish)]`}
            style={{ left: `${Math.min(92, Math.max(8, ((x(peak) + x(trough)) / 2 / W) * 100))}%`, top: `${Math.min(80, (y(book[trough]!) / H) * 100)}%` }}
          >
            {pct(module.worstDrop.pct)}
          </span>
        ) : null}
      </div>
      <div className={`${NUM} mt-2 flex justify-between text-[12px] text-oa-muted-fg`}>
        <span>{day(module.from, true)}</span>
        <span>{day(module.to, true)}</span>
      </div>
    </ChartCard>
  );
}

/** Weight against share of the swings. Above the line a holding swings the mix more than its size. */
function Scatter({ module }: { module: RiskModule }) {
  const points = module.shares;
  const lo = Math.min(0, ...points.map((point) => point.share));
  const hi = Math.max(...points.map((point) => Math.max(point.weight, point.share))) * 1.08;
  const at = (value: number) => ((value - lo) / (hi - lo)) * 100;
  // Logos on the holdings furthest from the line (the ones to look at), and on the biggest.
  const labelled = new Set(
    [...points]
      .sort((a, b) => Math.abs(b.share - b.weight) - Math.abs(a.share - a.weight))
      .slice(0, 4)
      .map((point) => point.ticker),
  );
  const top = [...points].sort((a, b) => b.share - a.share)[0];
  if (top) labelled.add(top.ticker);
  return (
    <ChartCard title="Size against share of the swings" aside={<span>above the line: more swing than size</span>} newRow>
      <div className="relative ml-1 mr-2 h-[220px] border-b border-l border-oa-border">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <line x1={at(lo)} y1={100 - at(lo)} x2="100" y2={100 - at(hi)} stroke="var(--oa-border)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((point) => (
          <span
            key={point.ticker}
            className="absolute -translate-x-1/2 translate-y-1/2"
            style={{ left: `${at(point.weight)}%`, bottom: `${at(point.share)}%` }}
            title={`${point.ticker}: ${pct(point.weight)} of the money, ${pct(point.share)} of the swings`}
          >
            {labelled.has(point.ticker) ? (
              <span className="flex items-center gap-1 whitespace-nowrap rounded-full border border-oa-border bg-oa-card py-0.5 pl-0.5 pr-1.5 shadow-sm">
                <StockLogo ticker={point.ticker} size={16} atOnce circle />
                <span className={`${NUM} text-[11.5px] text-oa-fg`}>{point.ticker}</span>
              </span>
            ) : (
              <span className="block size-2.5 rounded-full" style={{ background: MINE }} />
            )}
          </span>
        ))}
        <span className="absolute left-1.5 top-0 whitespace-nowrap text-[11.5px] text-oa-muted-fg">share of swings</span>
      </div>
      <div className="ml-1 mr-2 mt-1 flex justify-between text-[11.5px] text-oa-muted-fg">
        <span className={NUM}>0%</span>
        <span>share of money</span>
      </div>
      {top ? (
        <p className="mt-3 text-[13px] leading-[18px] text-oa-muted-fg">
          {top.ticker} is {pct(top.weight)} of the money and {pct(top.share)} of the swings
        </p>
      ) : null}
    </ChartCard>
  );
}
