import type { CrashModule } from "@/lib/portfolio-analysis/types";

import { ChartCard, DOWN, LIST, Module, NUM, SPAN, Tick, UP, signedPct, signedPts } from "./parts";

/**
 * Past crashes: today's mix and the S&P 500 through each episode (7 columns), beside the holdings that did the
 * most damage in the worst one (5), about the same height. What today's mix would have done, not what anyone earned.
 */
export function Crashes({ module }: { module: CrashModule }) {
  const worst = module.worst ? module.episodes.find((episode) => episode.id === module.worst!.id) : null;
  return (
    <Module id="crashes" title="Today's mix through past shocks">
      <Episodes module={module} className={worst && module.worst ? SPAN[7] : SPAN[12]} />
      {worst && module.worst ? (
        <ChartCard title={`What fell in the ${worst.name}`} flush className={SPAN[5]}>
          <ul className={`${LIST} px-4 py-2`}>
            {module.worst.drivers.map((driver) => (
              <li key={driver.ticker} className="grid h-8 grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-center gap-2">
                <Tick ticker={driver.ticker} />
                <span className={`${NUM} text-right text-[12.5px] text-oa-muted-fg`}>{signedPct(driver.pct, 0)}</span>
                <span className={`${NUM} text-right text-[13px] text-[color:var(--signal-bearish)]`}>{signedPts(driver.contribution)}</span>
              </li>
            ))}
          </ul>
        </ChartCard>
      ) : null}
    </Module>
  );
}

/**
 * Each shock as a compact table row: today's mix and the S&P 500 through it. No bars: they only drew the two numbers
 * printed beside them (owner rule 5).
 */
function Episodes({ module, className }: { module: CrashModule; className: string }) {
  const grid = "grid grid-cols-[minmax(0,1fr)_4.25rem_4.25rem] items-center gap-3";
  return (
    <ChartCard title="Each shock" flush className={className}>
      <div className={`${grid} border-b border-oa-border px-4 py-1.5 text-[12px] leading-4 text-oa-muted-fg`}>
        <span>Shock</span>
        <span className="text-right">You</span>
        <span className="text-right">S&amp;P 500</span>
      </div>
      <ul className="flex flex-col px-4 py-1">
        {module.episodes.map((episode) => (
          <li key={episode.id} className={`${grid} h-8 border-b border-oa-border last:border-b-0`}>
            <span className="min-w-0 truncate text-[13px] leading-5 text-oa-fg" title={episode.name}>
              {episode.name.replace(/^./, (c) => c.toUpperCase())}
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
