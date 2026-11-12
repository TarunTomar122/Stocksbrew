import { getMarketSnapshot } from "@/lib/firestore";
import { getMarketsData } from "@/lib/markets";
import { sectorFundDays, type SectorFundDay } from "@/lib/sector-day-shared";
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
