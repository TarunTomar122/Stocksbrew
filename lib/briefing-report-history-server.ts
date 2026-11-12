import type { Briefing } from "@/lib/briefing";
import type { BriefingReportHistory } from "@/lib/briefing-read";
import { bigVsDayWords } from "@/lib/briefing-move-facts";
import { moveStats } from "@/lib/earnings-season";
import { loadTickerEarnings } from "@/lib/earnings-season-data";
import { noteDegradedRender } from "@/lib/next-render";

/**
 * How each held stock with a report coming up has moved on its past reports, for the read's earnings card
 * (lib/briefing-read.ts): the same shared cached history and the same sums as the inbox's report rows
 * (lib/inbox/sources.ts reportsSource). Within BUDGET_MS, else nothing: a slow read never holds up the briefing.
 */

/**
 * Most stocks read. The read names one report, but it skips stocks that need a decision, so the soonest few could all
 * be skipped: six is enough room, and each is a shared cached read.
 */
const MAX_STOCKS = 6;
const BUDGET_MS = 1500;

/** The held stocks with a report coming up, soonest first. Pure. */
export function heldReportTickers(briefing: Pick<Briefing, "needs_you" | "also_today">): string[] {
  const out: Array<{ ticker: string; days: number }> = [];
  for (const item of [...briefing.needs_you, ...briefing.also_today]) {
    const ticker = item.ticker?.trim().toUpperCase();
    if (item.kind !== "earnings_upcoming" || item.relation !== "holding" || !ticker || out.some((entry) => entry.ticker === ticker)) continue;
    out.push({ ticker, days: item.deadline_days ?? 99 });
  }
  return out.sort((a, b) => a.days - b.days).slice(0, MAX_STOCKS).map((entry) => entry.ticker);
}

export async function briefingReportHistory(briefing: Briefing, today: string): Promise<Record<string, BriefingReportHistory> | undefined> {
  const tickers = heldReportTickers(briefing);
  if (tickers.length === 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), BUDGET_MS);
  });
  try {
    const loaded = await Promise.race([loadTickerEarnings(tickers, today), late]);
    if (loaded === "late") {
      // The cached signed-out copy built without it is not kept for long (lib/next-render.ts).
      noteDegradedRender();
      return undefined;
    }
    const out: Record<string, BriefingReportHistory> = {};
    for (const ticker of tickers) {
      const entry = loaded.get(ticker);
      if (!entry || entry.fund) continue;
      const stats = moveStats(entry.history.past, entry.history.typicalDayPct);
      if (stats.usual === null || stats.usualKind === null) continue;
      const normal = entry.history.typicalDayPct;
      out[ticker] = {
        usualPct: stats.usual,
        usualKind: stats.usualKind,
        normalPct: typeof normal === "number" && Number.isFinite(normal) && normal > 0 ? normal : null,
        // One report is not a pattern: no "times a normal day" from it (lib/earnings-season.ts does the same).
        vsDay: stats.usualKind === "single" ? null : bigVsDayWords(stats.vsNormalDay),
      };
    }
    return Object.keys(out).length > 0 ? out : undefined;
  } finally {
    clearTimeout(timer);
  }
}
