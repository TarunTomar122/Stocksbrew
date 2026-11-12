import type { StressResult } from "@/lib/stress-test";

import { round } from "./stats";
import type { CrashDriver, CrashModule } from "./types";

/**
 * Past crashes, from lib/stress-test.ts unchanged: each episode's start-to-end adjusted return applied to today's
 * weights. It is what today's mix would have done, not what anyone earned. An episode is shown only when at least
 * MIN_COVERAGE of the money has prices for it (a holding that was not trading yet is left out, never read as flat).
 * Under the worst fall, the holdings that did the damage, most first.
 */

export const MIN_COVERAGE = 80;
export const MAX_DRIVERS = 8;

export function buildCrashes(result: StressResult | null): CrashModule | null {
  if (!result) return null;
  const episodes = result.episodes
    .filter((episode) => episode.portfolio !== null && episode.covered >= MIN_COVERAGE)
    .map((episode) => ({
      id: episode.episode.id,
      name: episode.episode.name,
      start: episode.episode.start,
      end: episode.episode.end,
      kind: episode.episode.kind,
      book: round(episode.portfolio!, 1),
      sp: episode.market === null ? null : round(episode.market, 1),
      coveragePct: round(episode.covered, 1),
    }));
  if (episodes.length === 0) return null;
  const falls = episodes.filter((episode) => episode.kind === "fall");
  const worst = falls.reduce<(typeof falls)[number] | null>((low, episode) => (!low || episode.book < low.book ? episode : low), null);
  let drivers: CrashDriver[] = [];
  if (worst && worst.book < 0) {
    const source = result.episodes.find((episode) => episode.episode.id === worst.id)!;
    drivers = source.moves
      .filter((move) => move.status === "ok" && move.contribution !== null && move.pct !== null && move.contribution < 0)
      .sort((a, b) => a.contribution! - b.contribution!)
      .slice(0, MAX_DRIVERS)
      .map((move) => ({ ticker: move.ticker, name: move.name, pct: round(move.pct!, 1), contribution: round(move.contribution!, 1) }));
  }
  return { episodes, worst: worst && drivers.length > 0 ? { id: worst.id, drivers } : null };
}
