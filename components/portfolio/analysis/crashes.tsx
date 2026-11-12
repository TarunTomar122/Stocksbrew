import type { CrashDriver, CrashModule } from "@/lib/portfolio-analysis/types";

import { ChartCard, DOWN, Key, MINE, Module, NUM, SP, SPAN, Tick, UP, signedPct, signedPts } from "./parts";

/** Fewer holdings than this and the two tables stack across the page instead of sitting side by side. */
const MIN_BESIDE = 5;
/** A table that takes its height from the one beside it: adds nothing to the row, then fills it and scrolls inside. */
const FILLS = "lg:h-0 lg:min-h-full";
const SCROLL = "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Past crashes: today's mix and the S&P 500 through each episode (7 columns), beside every holding in the worst one
 * (5), both ending level. The longer table takes its height from the shorter and scrolls inside past it; with fewer
 * than MIN_BESIDE holdings the two stack across the page. What today's mix would have done, not what anyone earned.
 */
export function Crashes({ module }: { module: CrashModule }) {
  const worst = module.worst ? module.episodes.find((episode) => episode.id === module.worst!.id) : null;
  const drivers = worst && module.worst ? module.worst.drivers : null;
  const beside = Boolean(drivers && drivers.length >= MIN_BESIDE);
  // Whichever table is longer fills the other's height.
  const driversFill = beside && drivers!.length >= module.episodes.length;
  return (
    <Module id="crashes" title="Today's mix through past shocks">
      <Episodes module={module} className={beside ? `${SPAN[7]} ${driversFill ? "" : FILLS}` : SPAN[12]} fill={beside && !driversFill} />
      {worst && drivers ? (
        <Drivers name={worst.name} drivers={drivers} className={beside ? `${SPAN[5]} ${driversFill ? FILLS : ""}` : SPAN[12]} fill={driversFill} split={!beside} />
      ) : null}
    </Module>
  );
}

const HEAD = "border-b border-oa-border px-4 py-1.5 text-[12px] leading-4 text-oa-muted-fg";

/** A bar from a centre line, right for a rise and left for a fall, `max` reaching the card's half width. */
function Centred({ value, max, color }: { value: number; max: number; color: string }) {
  const width = `${Math.min(50, (Math.abs(value) / max) * 50)}%`;
  return (
    <span className="relative block h-1.5">
      <span className="absolute inset-y-0 left-1/2 w-px bg-oa-border" />
      <span className="absolute inset-y-0 rounded-[1px]" style={{ width, background: color, ...(value < 0 ? { right: "50%" } : { left: "50%" }) }} />
    </span>
  );
}

/** Each shock as a compact table row: today's mix and the S&P 500 through it, in figures and as a pair of bars. */
function Episodes({ module, className, fill }: { module: CrashModule; className: string; fill: boolean }) {
  const grid = "grid grid-cols-[minmax(0,1fr)_3.75rem_4.25rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(4rem,9rem)_3.75rem_4.25rem]";
  const max = Math.max(1, ...module.episodes.flatMap((episode) => [Math.abs(episode.book), Math.abs(episode.sp ?? 0)]));
  return (
    <ChartCard
      title="Each shock"
      flush
      className={className}
      aside={
        <span className="flex items-center gap-3 max-sm:hidden">
          <Key color={MINE}>You</Key>
          <Key color={SP}>S&amp;P 500</Key>
        </span>
      }
    >
      <div className={`${grid} ${HEAD}`}>
        <span>Shock</span>
        <span className="max-sm:hidden" />
        <span className="text-right">You</span>
        <span className="text-right">S&amp;P 500</span>
      </div>
      <ul className={`flex flex-col px-4 py-1 ${fill ? `lg:min-h-0 lg:flex-1 ${SCROLL}` : ""}`}>
        {module.episodes.map((episode) => (
          <li key={episode.id} className={`${grid} h-8 shrink-0 border-b border-oa-border last:border-b-0`}>
            <span className="min-w-0 truncate text-[13px] leading-5 text-oa-fg" title={episode.name}>
              {episode.name.replace(/^./, (c) => c.toUpperCase())}
            </span>
            <span className="flex flex-col gap-[3px] max-sm:hidden" role="img" aria-label={`You ${signedPct(episode.book, 0)}${episode.sp !== null ? `, the S&P 500 ${signedPct(episode.sp, 0)}` : ""}`}>
              <Centred value={episode.book} max={max} color={MINE} />
              {episode.sp !== null ? <Centred value={episode.sp} max={max} color={SP} /> : <span className="block h-1.5" />}
            </span>
            <span className={`${NUM} text-right text-[13px]`} style={{ color: episode.book < 0 ? DOWN : UP }}>
              {signedPct(episode.book, 0)}
            </span>
            <span className={`${NUM} text-right text-[13px] text-oa-muted-fg`}>{episode.sp !== null ? signedPct(episode.sp, 0) : "–"}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/**
 * Every holding in the worst fall, the most damage first: its own move, and the points it took off (or added to) the
 * mix, with a bar for those points so the big losers read at a glance.
 */
function Drivers({ name, drivers, className, fill, split }: { name: string; drivers: CrashDriver[]; className: string; fill: boolean; split: boolean }) {
  const grid = "grid grid-cols-[5.75rem_minmax(0,1fr)_3.25rem_4.5rem] items-center gap-2";
  const max = Math.max(0.1, ...drivers.map((driver) => Math.abs(driver.contribution)));
  return (
    <ChartCard title={`Each holding in the ${name}`} flush className={className}>
      <div className={`${grid} ${HEAD} ${split ? "lg:hidden" : ""}`}>
        <span>Holding</span>
        <span />
        <span className="text-right">Move</span>
        <span className="text-right">On you</span>
      </div>
      {/* Under lg it is a capped table of about eight rows, scrolling inside like the others on the page. */}
      <ul className={`max-lg:max-h-[16.5rem] px-4 py-1 ${SCROLL} ${fill ? "lg:min-h-0 lg:flex-1" : "lg:overflow-visible"} ${split ? "lg:columns-2 lg:gap-x-10" : ""}`}>
        {drivers.map((driver) => (
          <li key={driver.ticker} className={`${grid} h-8 break-inside-avoid`}>
            <Tick ticker={driver.ticker} />
            <span className="flex h-1.5 justify-end" aria-hidden="true">
              <span className="h-full rounded-[1px]" style={{ width: `${(Math.abs(driver.contribution) / max) * 100}%`, background: driver.contribution < 0 ? DOWN : UP, opacity: 0.75 }} />
            </span>
            <span className={`${NUM} text-right text-[12.5px] text-oa-muted-fg`}>{signedPct(driver.pct, 0)}</span>
            <span className={`${NUM} text-right text-[13px]`} style={{ color: driver.contribution < 0 ? DOWN : driver.contribution > 0 ? UP : undefined }}>
              {signedPts(driver.contribution)}
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
