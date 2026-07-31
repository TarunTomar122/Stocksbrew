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
  buildDecisionCards,
  buildBookRows,
  buildHealthProps,
  buildIdeas,
  collectIdeaInstrumentIds,
  countOpenLoops,
  enrichIdeas,
} from "@/lib/radar-next-data";
import { CommandHeader } from "@/components/radar-next/command-header";
import { DecisionQueue } from "@/components/radar-next/decision-queue";
import { Book } from "@/components/radar-next/book";
import { AttentionQueue } from "@/components/radar-next/attention-queue";
import { Health } from "@/components/radar-next/health";
import { Ideas } from "@/components/radar-next/ideas";
import { RadarNextSkeleton } from "@/components/radar-next/skeleton";
import { RadarNextSignedOut, RadarNextEmpty } from "@/components/radar-next/states";
import { RadarPageAnalytics } from "@/components/radar-page-analytics";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";

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

  const decisions = buildDecisionCards(rows, activeRadarUserView);
  const openLoops = countOpenLoops(rows);
  const book = buildBookRows(rows, { states: radarStockStates, newsInstrumentIds });
  const health = buildHealthProps(diagnosis, holdings.length);
  const ideasBase = buildIdeas(watchlistView?.suggestions);
  const ideaMarket = await getIdeaMarketData(collectIdeaInstrumentIds(ideasBase)).catch(
    () => new Map(),
  );
  const ideas = enrichIdeas(ideasBase, ideaMarket);

  const moversUp = rows.filter((r) => (r.day_change_pct ?? 0) > 0).length;
  const moversDown = rows.filter((r) => (r.day_change_pct ?? 0) < 0).length;
  const statusLine = `${rows.length} tracked · ${decisions.length} ${
    decisions.length === 1 ? "decision" : "decisions"
  } · ${openLoops} open ${openLoops === 1 ? "checkpoint" : "checkpoints"} · ${moversUp} up / ${moversDown} down`;
  const editableItems = rows.map((row) => ({
    instrument_id: row.instrument_id,
    ticker: row.ticker,
    name: row.instrument_name ?? row.ticker,
    position_type: row.position_type === "holding" ? ("holding" as const) : ("watchlist" as const),
    holding:
      row.position_type === "holding"
        ? {
            quantity: row.holding?.quantity ?? null,
            market_value: row.holding?.market_value ?? null,
            average_cost: row.holding?.average_cost ?? null,
          }
        : undefined,
  }));

  return (
    <>
      <RadarPageAnalytics state="active" trackedCount={rows.length} isSubscribed={isSubscribed} />
      <div className="radar-next mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-4 pb-8 pt-3 sm:gap-14 sm:px-6 sm:pb-12 sm:pt-6">
        <CommandHeader
          greeting={greetingFor(now)}
          dateLabel={dateLabelFor(now)}
          statusLine={statusLine}
          trackedCount={rows.length}
          isSubscribed={isSubscribed}
          actions={
            <RadarBatchEditModal
              initialItems={editableItems}
              isSubscribed={isSubscribed}
              ctaLabel="Add or manage"
              triggerClassName="inline-flex items-center rounded-full bg-[var(--rn-ink)] px-4 py-2 text-[12px] font-bold text-[var(--rn-card)] transition-opacity hover:opacity-85"
            />
          }
        />

        <DecisionQueue items={decisions} openLoops={openLoops} />
        <AttentionQueue items={activeRadarUserView?.attention_items ?? []} />
        <Book holdings={book.holdings} watching={book.watching} />
        <Health
          grade={health.grade}
          gradePct={health.gradePct}
          headline={health.headline}
          body={health.body}
          fixes={health.fixes}
          pillars={health.pillars}
        />
        <Ideas fits={ideas.fits} top={ideas.top} unusual={ideas.unusual} />
      </div>
    </>
  );
}
