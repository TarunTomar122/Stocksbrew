import { RadarEarningsReadyBanner } from "@/components/radar-earnings-ready-banner";
import { RadarEarningsUpcomingBanner } from "@/components/radar-earnings-upcoming-banner";
import {
  filterEarningsIntelThisWeek,
  getLatestEarningsIntelForInstruments,
  type EarningsIntelDoc,
} from "@/lib/earnings-intel";
import { getPreEarningsIntelForInstruments } from "@/lib/pre-earnings-intel";
import {
  filterPreEarningsWithinDays,
  type PreEarningsIntelDoc,
} from "@/lib/pre-earnings-intel-shared";
import type { WatchlistRow } from "@/lib/watchlist-view";

async function loadEarningsRails(rows: WatchlistRow[]) {
  if (rows.length === 0) {
    return {
      earningsReadyThisWeek: [] as EarningsIntelDoc[],
      earningsUpcomingThisWeek: [] as PreEarningsIntelDoc[],
    };
  }

  const idsByMarket = { US: [] as string[], IN: [] as string[] };
  for (const row of rows) {
    const m = row.market === "IN" ? "IN" : "US";
    idsByMarket[m].push(row.instrument_id);
  }

  const [usDocs, inDocs, usPre, inPre] = await Promise.all([
    idsByMarket.US.length
      ? getLatestEarningsIntelForInstruments("US", idsByMarket.US).catch(() => [] as EarningsIntelDoc[])
      : Promise.resolve([] as EarningsIntelDoc[]),
    idsByMarket.IN.length
      ? getLatestEarningsIntelForInstruments("IN", idsByMarket.IN).catch(() => [] as EarningsIntelDoc[])
      : Promise.resolve([] as EarningsIntelDoc[]),
    idsByMarket.US.length
      ? getPreEarningsIntelForInstruments("US", idsByMarket.US).catch(() => [] as PreEarningsIntelDoc[])
      : Promise.resolve([] as PreEarningsIntelDoc[]),
    idsByMarket.IN.length
      ? getPreEarningsIntelForInstruments("IN", idsByMarket.IN).catch(() => [] as PreEarningsIntelDoc[])
      : Promise.resolve([] as PreEarningsIntelDoc[]),
  ]);

  return {
    earningsReadyThisWeek: filterEarningsIntelThisWeek([...usDocs, ...inDocs]),
    earningsUpcomingThisWeek: filterPreEarningsWithinDays([...usPre, ...inPre]),
  };
}

export async function RadarEarningsRailsStream({ rows }: { rows: WatchlistRow[] }) {
  const { earningsReadyThisWeek, earningsUpcomingThisWeek } = await loadEarningsRails(rows);

  if (earningsUpcomingThisWeek.length === 0 && earningsReadyThisWeek.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {earningsUpcomingThisWeek.length > 0 ? (
        <RadarEarningsUpcomingBanner docs={earningsUpcomingThisWeek} />
      ) : null}
      {earningsReadyThisWeek.length > 0 ? (
        <RadarEarningsReadyBanner docs={earningsReadyThisWeek} />
      ) : null}
    </div>
  );
}
