import type { CrashModule } from "@/lib/portfolio-analysis/types";

import { ChartCard, DOWN, Key, LIST, MINE, Module, NUM, SP, Tick, UP, signedPct, signedPts } from "./parts";

/**
 * Past crashes: today's mix and the S&P 500 through each episode as a pair of bars from a zero line, then the
 * holdings that did the most damage in the worst one. What today's mix would have done, not what anyone earned.
 */
export function Crashes({ module }: { module: CrashModule }) {
  const worst = module.worst ? module.episodes.find((episode) => episode.id === module.worst!.id) : null;
  return (
    <Module id="crashes" title="Today's mix through past shocks">
      <Episodes module={module} />
      {worst && module.worst ? (
        <ChartCard title={`What fell in the ${worst.name}`} wide={false} flush>
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

function Episodes({ module }: { module: CrashModule }) {
  // The zero line sits where the falls end and the rises begin, so most of the width goes to what happened.
  const values = module.episodes.flatMap((episode) => [episode.book, episode.sp ?? 0]);
  const fall = Math.max(0, ...values.map((value) => -value));
  const rise = Math.max(0, ...values);
  const span = Math.max(1, fall + rise);
  const zero = (fall / span) * 100;
  const bar = (value: number, color: string) => {
    const width = (Math.abs(value) / span) * 100;
    return (
      <span className="relative block h-2.5">
        <span
          className="absolute inset-y-0 rounded-[2px]"
          style={{ left: value < 0 ? `${zero - width}%` : `${zero}%`, width: `${Math.max(0.5, width)}%`, background: color }}
        />
      </span>
    );
  };
  return (
    <ChartCard
      title="Each shock"
      aside={
        <>
          <Key color={MINE}>You</Key>
          <Key color={SP}>S&amp;P 500</Key>
        </>
      }
      flush
    >
      <ul className="flex flex-col px-4 py-2">
        {module.episodes.map((episode) => (
          <li key={episode.id} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.75rem] items-center gap-3 border-b border-oa-border py-2 last:border-b-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.25rem]">
            <span className="min-w-0 text-[13px] leading-[17px] text-oa-fg">
              {episode.name.replace(/^./, (c) => c.toUpperCase())}
            </span>
            <span className="relative flex flex-col gap-[3px]" role="img" aria-label={`${episode.name}: you ${signedPct(episode.book)}, S&P 500 ${episode.sp === null ? "unknown" : signedPct(episode.sp)}`}>
              <span aria-hidden="true" className="absolute inset-y-[-4px] w-px bg-oa-border" style={{ left: `${zero}%` }} />
              {bar(episode.book, MINE)}
              {episode.sp !== null ? bar(episode.sp, SP) : null}
            </span>
            <span className={`${NUM} flex flex-col items-end text-[12.5px] leading-[15px]`}>
              <span style={{ color: episode.book < 0 ? DOWN : UP }}>{signedPct(episode.book, 0)}</span>
              {episode.sp !== null ? <span className="text-oa-muted-fg">{signedPct(episode.sp, 0)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
