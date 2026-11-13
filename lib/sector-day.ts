import { getMarketSnapshot } from "@/lib/firestore";
import { getMarketsData } from "@/lib/markets";
import { getScreenerSnapshot, isCompleteSnapshot } from "@/lib/screener";
import { sectorFund, sectorFundDays, type SectorFundDay } from "@/lib/sector-day-shared";
import { sharedCache } from "@/lib/shared-cache";
import type { SnapshotRow } from "@/lib/types";

/**
 * The day's sector moves and the live stock quotes under them (lib/sector-day-shared.ts says why): the sector funds
 * from the markets read Market today uses (cached five minutes), the quotes from the price snapshot (cached a
 * minute). Each part fails soft to nothing, so the caller keeps its stored figures and says their own day.
 */
export async function loadSectorDay(): Promise<{ funds: Map<string, SectorFundDay>; live: SnapshotRow[] }> {
  const [markets, live] = await Promise.all([
    getMarketsData().catch(() => null),
    getMarketSnapshot("US").catch((): SnapshotRow[] => []),
  ]);
  return { funds: sectorFundDays(markets?.assets ?? []), live };
}

/**
 * Every covered stock's sector fund, ticker -> fund id ("NVDA" -> "xlk"), from the screener snapshot's sectors (resolved
 * from each stock's industry, lib/screener.ts). Small (a few kilobytes) and cached an hour, so a page that only needs
 * each stock's sector never reads the snapshot's shards itself. Throws on a missing or partial snapshot, so that is
 * never cached; the caller goes without.
 */
export const getSectorFundIndex = sharedCache(
  async (): Promise<Record<string, string>> => {
    const snapshot = await getScreenerSnapshot();
    if (!isCompleteSnapshot(snapshot)) throw new Error("sector index: screener snapshot missing or partial");
    const out: Record<string, string> = {};
    for (const row of snapshot.rows) {
      const fund = sectorFund(row.sector);
      if (fund) out[row.symbol.toUpperCase()] = fund;
    }
    return out;
  },
  ["sector-fund-index-v1"],
  { revalidate: 3600 },
);
