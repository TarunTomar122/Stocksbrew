import { Suspense } from "react";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import {
  getWatchlistView,
  getRadarUserView,
  getRadarStockStates,
  getIdeaMarketData,
  isActiveRadarUserView,
  overlayLatestPrices,
  buildHoldingsDiagnosis,
  type WatchlistRow,
} from "@/lib/watchlist-view";
import {
  buildRadarStarterPicks,
  starterPickInstrumentIds,
} from "@/lib/radar-starter-picks";
import { getInstrumentLabels } from "@/lib/instrument-resolver";
import { getInterestingStocks } from "@/lib/interesting-stocks";
import {
  buildBookRows,
  buildHealthProps,
  buildIdeas,
  collectIdeaInstrumentIds,
  countAttentionRows,
  enrichIdeas,
} from "@/lib/radar-next-data";
import { CommandHeader } from "@/components/radar-next/command-header";
import { Book } from "@/components/radar-next/book";
import { Health } from "@/components/radar-next/health";
import { Ideas } from "@/components/radar-next/ideas";
import { RadarNextSkeleton } from "@/components/radar-next/skeleton";
import { RadarNextSignedOut, RadarNextEmpty } from "@/components/radar-next/states";
import { RadarPageAnalytics } from "@/components/radar-page-analytics";

export const dynamic = "force-dynamic";

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Late session";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function dateLabelFor(date: Date): string {
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<RadarNextSkeleton />}>
      <RadarNextStream />
    </Suspense>
  );
}

async function RadarNextStream() {
  const session = await getSessionUser();
  if (!session) {
    return (
      <>
        <RadarPageAnalytics state="signed_out" trackedCount={0} isSubscribed={false} />
        <RadarNextSignedOut />
      </>
    );
  }

  const userDoc = await getUserDoc(session.uid);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const isSubscribed = resolveIsSubscribed(userDoc);

  const now = new Date();
  if (tracked.length === 0) {
    const [interestingDoc, labelsById] = await Promise.all([
      getInterestingStocks("US").catch(() => null),
      getInstrumentLabels(starterPickInstrumentIds()).catch(() => new Map()),
    ]);
    const picks = buildRadarStarterPicks(interestingDoc?.rows, labelsById);

    return (
      <>
        <RadarPageAnalytics state="empty" trackedCount={0} isSubscribed={isSubscribed} />
        <RadarNextEmpty
          header={{
            greeting: greetingFor(now),
            dateLabel: dateLabelFor(now),
            statusLine: "0 tracked. Add stocks to start your Radar",
            trackedCount: 0,
            isSubscribed,
          }}
          picks={picks}
          trackedIds={[]}
        />
      </>
    );
  }

  const [watchlistView, radarUserView] = await Promise.all([
    getWatchlistView(session.uid).catch(() => null),
    getRadarUserView(session.uid).catch(() => null),
  ]);
  const activeRadarUserView = isActiveRadarUserView(radarUserView) ? radarUserView : null;

  const materializedRows = (watchlistView?.rows || []) as WatchlistRow[];
  const trackedSet = new Set(tracked);
  const positions =
    userDoc?.watchlist_positions && typeof userDoc.watchlist_positions === "object"
      ? (userDoc.watchlist_positions as Record<string, "holding" | "watchlist">)
      : {};

  const rowsBase = materializedRows
    .filter((row) => trackedSet.has(row.instrument_id))
    .map((row) => ({
      ...row,
      position_type: positions[row.instrument_id] === "holding" ? "holding" : "watchlist",
    })) as WatchlistRow[];

  const rowsPriced = await overlayLatestPrices(rowsBase).catch(() => rowsBase);
  const labelsById = await getInstrumentLabels(rowsPriced.map((r) => r.instrument_id)).catch(
    () => new Map(),
  );
  const rows = rowsPriced.map((r) => {
    const label = labelsById.get(r.instrument_id);
    return label ? { ...r, ticker: label.ticker || r.ticker, instrument_name: label.name } : r;
  });

  const holdings = rows.filter((r) => r.position_type === "holding");
  const diagnosis = buildHoldingsDiagnosis(holdings);
  const radarStockStates = await getRadarStockStates(rows.map((r) => r.instrument_id)).catch(() => ({}));

  const newsInstrumentIds = new Set(
    (activeRadarUserView?.attention_items ?? []).map((item) => item.instrument_id.toUpperCase()),
  );

  const book = buildBookRows(rows, { states: radarStockStates, newsInstrumentIds });
  const health = buildHealthProps(diagnosis, holdings.length);
  const attentionCount = countAttentionRows(rows);
  const ideasBase = buildIdeas(watchlistView?.suggestions);
  const ideaMarket = await getIdeaMarketData(collectIdeaInstrumentIds(ideasBase)).catch(
    () => new Map(),
  );
  const ideas = enrichIdeas(ideasBase, ideaMarket);

  const moversUp = rows.filter((r) => (r.day_change_pct ?? 0) > 0).length;
  const moversDown = rows.filter((r) => (r.day_change_pct ?? 0) < 0).length;
  const statusLine =
    activeRadarUserView?.narrative?.headline?.trim() ||
    `${rows.length} tracked · ${moversUp} up / ${moversDown} down${
      attentionCount > 0
        ? ` · ${attentionCount} in zone`
        : ""
    }`;

  return (
    <>
      <RadarPageAnalytics state="active" trackedCount={rows.length} isSubscribed={isSubscribed} />
      <div className="radar-next radar-next-glow flex w-full max-w-full flex-col gap-3 px-2 pb-3 pt-2 sm:gap-7 sm:px-1 sm:pb-4 sm:pt-8">
        <CommandHeader
          greeting={greetingFor(now)}
          dateLabel={dateLabelFor(now)}
          statusLine={statusLine}
          trackedCount={rows.length}
          isSubscribed={isSubscribed}
        />

        <div className="grid gap-3 sm:gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Book holdings={book.holdings} watching={book.watching} />
          <Health
            grade={health.grade}
            gradePct={health.gradePct}
            headline={health.headline}
            body={health.body}
            fixes={health.fixes}
            pillars={health.pillars}
          />
        </div>

        <Ideas fits={ideas.fits} top={ideas.top} unusual={ideas.unusual} />
      </div>
    </>
  );
}
