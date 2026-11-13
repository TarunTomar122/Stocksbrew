/**
 * The hero's counters: what the agent went through on its last market day, as three figures with a few words each,
 * read from the agent log's own entries (lib/agent-log, the jobs' stored records), so a count here is the one the
 * briefing's rail says. A check that did not run, or ran with nothing to count, is left out. Pure.
 */

import type { NavIcon } from "@/components/oa/nav-items";
import type { AgentLog, AgentLogEntry } from "@/lib/agent-log/types";

export type HeroCounter = {
  source: AgentLogEntry["source"];
  icon: NavIcon;
  /** As written: "178", "1,212". */
  figure: string;
  /** Four words at most. */
  label: string;
  href: string;
};

/** The most telling first: how much it read, then what it found. */
const ORDER: AgentLogEntry["source"][] = ["calls", "filings", "moves", "premarket", "earnings", "insiders"];

const numbers = (status: string): string[] => status.match(/\d[\d,]*/g) ?? [];
const positive = (figure: string | undefined): figure is string => Boolean(figure) && Number(figure!.replace(/,/g, "")) > 0;
const plural = (figure: string, one: string, many: string) => (figure === "1" ? one : many);

function counterFor(entry: AgentLogEntry): HeroCounter | null {
  const base = { source: entry.source, href: entry.href };
  const [first, second] = numbers(entry.status);
  switch (entry.source) {
    case "calls": {
      // "2 of 178 changed", or "none of 175 changed": the second (or only) count is how many calls it reviewed.
      const reviewed = entry.status.startsWith("none") ? first : second;
      return positive(reviewed) ? { ...base, icon: "research", figure: reviewed, label: plural(reviewed, "call reviewed", "calls reviewed") } : null;
    }
    case "filings":
      // A quiet filings line counts the companies checked, not filings read ("none new"): no counter.
      return !entry.quiet && positive(entry.figure) ? { ...base, icon: "filings", figure: entry.figure, label: plural(entry.figure, "SEC filing read", "SEC filings read") } : null;
    case "moves":
      // "23 of 30 explained": the moves it looked into.
      return positive(second ?? first) ? { ...base, icon: "movers", figure: (second ?? first)!, label: plural((second ?? first)!, "big move looked into", "big moves looked into") } : null;
    case "premarket":
      return positive(entry.figure) ? { ...base, icon: "premarket", figure: entry.figure, label: "pre-open checks" } : null;
    case "earnings":
      return positive(entry.figure) ? { ...base, icon: "calendar", figure: entry.figure, label: plural(entry.figure, "earnings report checked", "earnings reports checked") } : null;
    case "insiders":
      return positive(entry.figure) ? { ...base, icon: "follow", figure: entry.figure, label: "insider trades read" } : null;
    default:
      return null;
  }
}

/** Three counters, or none when fewer than three checks ran (two figures do not fill the row). */
export function heroCounters(log: AgentLog | null): HeroCounter[] {
  if (!log) return [];
  const out: HeroCounter[] = [];
  for (const source of ORDER) {
    const entry = log.entries.find((item) => item.source === source);
    const counter = entry ? counterFor(entry) : null;
    if (counter) out.push(counter);
    if (out.length === 3) break;
  }
  return out.length === 3 ? out : [];
}
