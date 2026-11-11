import { todayET } from "@/lib/calendar-shared";
import { getFundDigests, getInsiderBuys } from "@/lib/follow";
import { getCoverage } from "@/lib/seo/family-data";
import {
  BEST_LISTS,
  buildList,
  fundQuarter,
  listIsIndexable,
  tallyFundBuys,
  tallyInsiderBuys,
  type BestInput,
  type BestList,
  type BuiltList,
} from "@/lib/best-stocks";

/**
 * Server half of the "best stocks for X" lists: the screener snapshot (via
 * getCoverage, which throws when it cannot be read so a page answers 500
 * rather than an empty list), plus Form 4 insider buys and the funds' 13F
 * digests. The filing reads fail soft: without them only the two filing
 * lists come up short, and they are then noindexed by the normal rule.
 */

/** Enough open-market buys to cover the insider window; buys are a small share of Form 4 filings. */
const INSIDER_BUYS_READ = 1500;

async function insiderInput(today: string, covered: ReadonlySet<string>): Promise<BestInput["insiders"]> {
  const trades = await getInsiderBuys(INSIDER_BUYS_READ).catch(() => []);
  const tallies = tallyInsiderBuys(trades, today);
  // Only stocks we cover: each row links to a stock page with its price.
  for (const symbol of [...tallies.keys()]) if (!covered.has(symbol)) tallies.delete(symbol);
  return tallies;
}

async function fundInput(covered: ReadonlySet<string>): Promise<Pick<BestInput, "funds" | "fundPeriod" | "fundCount">> {
  const digests = await getFundDigests().catch(() => []);
  const period = fundQuarter(digests);
  const { funds, fundCount } = tallyFundBuys(digests, period);
  for (const symbol of [...funds.keys()]) if (!covered.has(symbol)) funds.delete(symbol);
  return { funds, fundPeriod: period, fundCount };
}

/** Everything the lists read, for today. */
export async function getBestInput(today: string = todayET()): Promise<BestInput> {
  const coverage = await getCoverage();
  const covered = new Set(coverage.bySymbol.keys());
  const [insiders, funds] = await Promise.all([insiderInput(today, covered), fundInput(covered)]);
  return {
    rows: coverage.rows,
    spy: coverage.spy,
    priceDay: coverage.priceDay,
    generatedAt: coverage.generatedAt,
    insiders,
    ...funds,
  };
}

export type BestListPage = { built: BuiltList; input: BestInput; indexable: boolean };

export async function getBestListPage(list: BestList, today: string = todayET()): Promise<BestListPage> {
  const input = await getBestInput(today);
  const built = buildList(list, input);
  return { built, input, indexable: listIsIndexable(built, today, input.fundPeriod) };
}

/** Every list built from one read, in the catalogue's order. */
export async function getAllBestLists(today: string = todayET()): Promise<{ input: BestInput; lists: Array<{ built: BuiltList; indexable: boolean }> }> {
  const input = await getBestInput(today);
  return {
    input,
    lists: BEST_LISTS.map((list) => {
      const built = buildList(list, input);
      return { built, indexable: listIsIndexable(built, today, input.fundPeriod) };
    }),
  };
}
