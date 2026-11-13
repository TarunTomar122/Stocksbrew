import Link from "next/link";

import { NavIcon } from "@/components/oa/nav-icon";
import { getAgentLog } from "@/lib/agent-log/server";
import { etToday, onDayWords } from "@/lib/day-words";
import { heroCounters } from "@/lib/landing-hero-counters";

/**
 * Under the hero's search, from lg: what the agent went through on its last market day, as three counters (an icon,
 * the figure, a few words), each opening where that work shows. From the agent log's stored records (cached for five
 * minutes, lib/agent-log/server.ts), read for at most READ_MS; with fewer than three counts, or a slow read, nothing
 * shows. It fills the left column beside the taller demo card; on a phone, where the columns stack, it is left out.
 */

const READ_MS = 1500;
const ROW = "mt-8 hidden max-w-xl lg:block xl:mt-10";
const CAPTION = "text-[13px] leading-5 text-oa-muted-fg";
const GRID = "mt-2.5 grid grid-cols-3 gap-2.5";
/** Each counter's fixed height, so the ghost holds its place. */
const TILE = "oa-surface flex h-[76px] min-w-0 flex-col justify-center border border-oa-border bg-oa-card px-3";

async function readLog() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_MS);
  });
  return Promise.race([getAgentLog(), late]).finally(() => clearTimeout(timer));
}

export async function HeroCounters() {
  const log = await readLog();
  const counters = heroCounters(log);
  if (!log || counters.length === 0) return null;
  return (
    <div className={ROW}>
      <p className={CAPTION}>What the agent did {onDayWords(log.day, etToday())}</p>
      <ul className={GRID}>
        {counters.map((counter) => (
          <li key={counter.source} className="min-w-0">
            <Link
              prefetch={false}
              href={counter.href}
              className={`${TILE} outline-none transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-fg/20`}
            >
              <span className="flex items-center gap-2">
                <NavIcon name={counter.icon} className="size-[15px] shrink-0 text-oa-primary" />
                <span className="oa-mono text-[22px] font-semibold leading-7 tracking-[-0.02em] tabular-nums text-oa-fg">{counter.figure}</span>
              </span>
              <span className="mt-0.5 truncate text-[13px] leading-5 text-oa-muted-fg">{counter.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The counters' place while the log loads, at their own height. */
export function HeroCountersGhost() {
  return (
    <div aria-hidden="true" className={ROW}>
      <p className={CAPTION}>&nbsp;</p>
      <div className={GRID}>
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className={TILE} />
        ))}
      </div>
    </div>
  );
}
