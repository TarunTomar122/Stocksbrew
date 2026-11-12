/**
 * The briefing's level cards' evidence: for each name at its own call's level, every measured fact from the stock
 * page's evidence (lib/call-evidence.ts) that backs the call, as card facts (lib/briefing-face.ts levelFact). The page
 * then picks one per card so the section doesn't repeat one kind of fact (pickLevelFacts).
 *
 * The stock page shows at most three lines, and a move stands in for the high; here every kind is read on its own, so
 * a stock's dividend or P/E is still there when its sales line is the first in line.
 *
 * Read only for the few candidates (lib/briefing-face.ts levelCandidates), from the same stored numbers the stock page
 * reads, and cached per stock, call and day, so a warm briefing pays nothing for them. Each read has its own time
 * limit: a slow stock loses its card, never the page.
 */

import { levelFact, type LevelCandidate, type LevelFact } from "@/lib/briefing-face";
import { within } from "@/lib/briefing-premarket-server";
import { buildCallEvidence, type CalendarReport, type CallEvidenceInput, type EvidenceLine, type ResultsReport } from "@/lib/call-evidence";
import { callEvidenceInput, getResultsReports } from "@/lib/call-evidence-data";
import { getScreenerSymbolContext } from "@/lib/screener";
import { getDailySeries } from "@/lib/screener-series";
import { sharedCache } from "@/lib/shared-cache";
import { getStockFacts } from "@/lib/stock";
import { getStockEarningsDates } from "@/lib/stock-events";

/** How long the page waits for one stock's facts before showing the section without that card. */
const REASON_READ_MS = 1500;

const CALL_WORD = { "Buy more": "Add", "Sell some": "Trim" } as const;

/**
 * Every evidence line the stock has, one kind at a time: the stock page keeps three, so each source is read with the
 * others left out (sales, the report, the dividend, the P/E, then the price on its own).
 */
export function allEvidence(input: CallEvidenceInput): EvidenceLine[] {
  const none = { sales: null, calendar: [], dividend: null, valuation: null, series: null } as const;
  const passes: Array<Partial<CallEvidenceInput>> = [
    { ...none, sales: input.sales },
    { ...none, calendar: input.calendar },
    { ...none, dividend: input.dividend },
    { ...none, valuation: input.valuation },
    { ...none, series: input.series },
  ];
  const out: EvidenceLine[] = [];
  for (const pass of passes) {
    for (const line of buildCallEvidence({ ...input, ...pass }).evidence) {
      if (!out.some((seen) => seen.id === line.id)) out.push(line);
    }
  }
  return out;
}

/**
 * One stock's facts, strongest first; empty when none of its evidence backs the call. Cached for everyone (it depends
 * only on the stock, the call and the day): the facts read throws when it fails, so a failed read is never kept.
 */
const levelFacts = sharedCache(
  async (ticker: string, instrumentId: string, call: LevelCandidate["call"], today: string): Promise<LevelFact[]> => {
    const [facts, reports, calendar, daily, context] = await Promise.all([
      getStockFacts(instrumentId),
      getResultsReports(ticker).catch(() => [] as ResultsReport[]),
      getStockEarningsDates("US", ticker).catch(() => []),
      getDailySeries([ticker, "SPY"]).catch(() => null),
      getScreenerSymbolContext(ticker).catch(() => null),
    ]);
    const row = context?.row ?? null;
    const input = callEvidenceInput({
      ticker,
      call: CALL_WORD[call],
      today,
      // The dividend's yield is over the snapshot's price, not the live one, so the cached line holds all day.
      price: typeof row?.price === "number" && row.price > 0 ? row.price : null,
      facts,
      reports,
      calendar: calendar as unknown as CalendarReport[],
      series: daily?.series ?? null,
      priceSource: daily?.source ?? null,
      row,
      // Only the evidence is used here; the steady call's conditions are the stock page's.
      steady: null,
      // Today is part of the cache key, so "yesterday" stays right for as long as the line is kept.
      sayDays: true,
    });
    return allEvidence(input)
      .map((line) => levelFact(line, call, today))
      .filter((fact): fact is LevelFact => fact !== null)
      .sort((a, b) => b.weight - a.weight);
  },
  ["briefing-level-facts-v2"],
  { revalidate: 3600 },
);

/** Each candidate's facts, by ticker; a name without any (or whose read failed or ran long) is simply absent. */
export async function loadLevelFacts(candidates: readonly LevelCandidate[], today: string): Promise<Record<string, LevelFact[]>> {
  const found = await Promise.all(
    candidates.map(async (candidate) => [candidate.ticker, await within(levelFacts(candidate.ticker, candidate.instrumentId, candidate.call, today), REASON_READ_MS)] as const),
  );
  const out: Record<string, LevelFact[]> = {};
  for (const [ticker, facts] of found) if (facts && facts.length > 0) out[ticker] = facts;
  return out;
}
