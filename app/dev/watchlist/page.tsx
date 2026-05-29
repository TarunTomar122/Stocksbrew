import Link from "next/link";
import { adminFirestore } from "@/lib/firebase-admin";
import { getWatchlistView } from "@/lib/watchlist-view";
import { getSearchIndex } from "@/lib/search";
import { getLatestEarningsIntelForInstruments, filterEarningsIntelThisWeek } from "@/lib/earnings-intel";
import { DevWatchlistPicker } from "@/components/dev-watchlist-picker";
import { partitionActivityEvents } from "@/lib/activity-events";
import {
  HeaderStrip, TodaySection, YourBookSection, DiagnosisSection,
  buildTapeItems, flattenAlerts, buildUpNext, rowDirective, directiveUrgency,
  buildActivityEvents, computePillarAverages, byAttention,
  formatRelative, asDict, tapeStyles,
} from "@/components/watchlist-sections";
import type { Dict } from "@/components/watchlist-sections";
import type { WatchlistBrief, WatchlistRow, WatchlistPulse } from "@/lib/watchlist-view";
import type { Directive } from "@/lib/stock";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import type { SearchEntry } from "@/lib/search";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DevWatchlistPage({ searchParams }: Props) {
  const params = await searchParams;
  const userId = typeof params.userId === "string" ? params.userId : "";

  // Fetch all users
  const allSnap = await adminFirestore.collection("users").get().catch(() => null);

  const users = allSnap
    ? allSnap.docs.map((doc) => {
        const d = doc.data();
        const isSub = d.is_subscribed || false;
        const status = d.subscriptionStatus || null;
        const statusNorm = (status || "").toLowerCase().trim();
        const activeStatuses = new Set(["active", "trialing"]);
        const plan: "pro" | "free" = isSub || activeStatuses.has(statusNorm) ? "pro" : "free";
        return {
          uid: doc.id,
          email: d.email || d.email_lower || null,
          display_name: d.display_name || null,
          photo_url: d.photo_url || null,
          is_subscribed: isSub,
          subscriptionStatus: status,
          subscriptionPlan: d.subscriptionPlan || null,
          subscribedAt: d.subscribedAt || null,
          plan,
          created_at: d.created_at
            ? typeof d.created_at === "object" && d.created_at?.toDate
              ? d.created_at.toDate().toISOString()
              : String(d.created_at)
            : null,
          last_sign_in_at: d.last_sign_in_at
            ? typeof d.last_sign_in_at === "object" && d.last_sign_in_at?.toDate
              ? d.last_sign_in_at.toDate().toISOString()
              : String(d.last_sign_in_at)
            : null,
          tracked_stocks_count: Array.isArray(d.tracked_stocks) ? d.tracked_stocks.length : 0,
        };
      })
      .sort((a, b) => {
        if (a.subscribedAt && b.subscribedAt) return new Date(b.subscribedAt).getTime() - new Date(a.subscribedAt).getTime();
        if (a.subscribedAt) return -1;
        if (b.subscribedAt) return 1;
        return 0;
      })
    : [];

  // ── If no user selected, show picker-only ───────────────────────────
  if (!userId) {
    return (
      <div className="flex h-full w-full">
        <DevWatchlistPicker users={users} initialUserId="" />
      </div>
    );
  }

  // ── Fetch selected user's full data ─────────────────────────────────
  const [userSnap, watchlistView] = await Promise.all([
    adminFirestore.collection("users").doc(userId).get(),
    getWatchlistView(userId).catch(() => null),
  ]);

  if (!userSnap.exists) {
    return (
      <div className="flex h-full w-full">
        <DevWatchlistPicker users={users} initialUserId={userId} />
        <div className="flex flex-1 items-center justify-center bg-white">
          <p className="text-[15px] text-[#b91c1c]">User not found</p>
        </div>
      </div>
    );
  }

  const userData = userSnap.data()!;
  const tracked = Array.isArray(userData.tracked_stocks) ? userData.tracked_stocks.filter((id: unknown): id is string => typeof id === "string") : [];
  const searchIndex = await getSearchIndex("US").catch(() => [] as SearchEntry[]);
  const radar = userData.radar_v1 || {};
  const materializedRows = (watchlistView?.rows || radar.rows || []) as WatchlistRow[];
  const watchlistPositions = userData.watchlist_positions && typeof userData.watchlist_positions === "object"
    ? (userData.watchlist_positions as Record<string, "holding" | "watchlist">) : {};
  const watchlistHoldings = userData.watchlist_holdings && typeof userData.watchlist_holdings === "object"
    ? (userData.watchlist_holdings as Record<string, { quantity?: number | null; market_value?: number | null; average_cost?: number | null; source?: string; updated_at?: string }>) : {};

  const searchByInstrumentId = new Map(searchIndex.map((entry) => [entry.instrument_id, entry] as const));
  const trackedSet = new Set(tracked);
  const materializedById = new Map(
    materializedRows.filter((row) => trackedSet.has(row.instrument_id)).map((row) => [row.instrument_id, row] as const),
  );

  const rows = tracked
    .map((instrumentId) => {
      const materialized = materializedById.get(instrumentId);
      const profileHolding = watchlistHoldings[instrumentId];
      const holdingOverride: WatchlistRow["holding"] =
        watchlistPositions[instrumentId] === "holding" && profileHolding
          ? {
              quantity: profileHolding.quantity ?? null,
              market_value: profileHolding.market_value ?? null,
              average_cost: profileHolding.average_cost ?? null,
              source: profileHolding.source,
              updated_at: profileHolding.updated_at,
              portfolio_weight_pct: (materialized?.holding?.portfolio_weight_pct as number | null | undefined) ?? null,
            }
          : undefined;
      if (materialized) {
        return {
          ...materialized,
          position_type: watchlistPositions[instrumentId] === "holding" ? "holding" : "watchlist",
          holding: holdingOverride ?? materialized.holding,
        } as WatchlistRow;
      }
      const fallback = searchByInstrumentId.get(instrumentId);
      const ticker = fallback?.ticker || instrumentId.split("_").slice(1).join("_");
      const market = instrumentId.startsWith("IN_") ? "IN" : "US";
      return {
        instrument_id: instrumentId, ticker, logo_url: null,
        position_type: watchlistPositions[instrumentId] === "holding" ? "holding" : "watchlist",
        market, sector_label: "", industry_label: "", currency: market === "IN" ? "INR" : "USD",
        price: null, day_change_pct: null, day_change_abs: null,
        scores: { overall: null, verdict: null, valuation: null, growth: null, quality: null, momentum: null },
        alerts: [], catalysts: [], brief_tile: { micro: "Price and analysis are syncing.", vibe: "wild", source: "rules" },
        coverage_status: "score_pending", has_intel_pro: false,
      } as WatchlistRow;
    })
    .filter((row): row is WatchlistRow => Boolean(row));

  const suggestions = (watchlistView?.suggestions || radar.suggestions || []) as Dict[];
  const brief = ((watchlistView?.brief || radar.brief) ?? null) as WatchlistBrief | null;
  const pulse = ((watchlistView?.pulse || radar.pulse) ?? null) as WatchlistPulse | null;
  const portfolio = ((watchlistView?.portfolio || radar.portfolio) ?? {}) as Dict;
  const eventRadar = ((watchlistView?.event_radar || radar.event_radar) ?? []) as Dict[];
  const changes = ((watchlistView?.changes || radar.changes) ?? {}) as Dict;
  const builtAt = typeof watchlistView?.built_at === "string" ? watchlistView.built_at : typeof radar.built_at === "string" ? radar.built_at : undefined;

  // Derive directives
  const directiveRows = rows
    .map((row) => ({ row, directive: rowDirective(row) }))
    .filter((d): d is { row: WatchlistRow; directive: Directive } => Boolean(d.directive));
  directiveRows.sort((a, b) => directiveUrgency(b.row, b.directive) - directiveUrgency(a.row, a.directive));
  const topDirective = directiveRows[0] ?? null;
  const secondaryDirectives = directiveRows.slice(1, 5);

  // Tape
  const flatAlerts = flattenAlerts(rows);
  const tapeItems = buildTapeItems(rows, flatAlerts);

  // Ledger groupings
  const holdings = rows.filter((r) => r.position_type === "holding").sort(byAttention);
  const watching = rows.filter((r) => r.position_type !== "holding").sort(byAttention);

  // Up next
  const upNext = buildUpNext(rows);

  // Earnings
  let earningsReadyThisWeek: EarningsIntelDoc[] = [];
  if (rows.length > 0) {
    const idsByMarket = { US: [] as string[], IN: [] as string[] };
    for (const row of rows) {
      const m = row.market === "IN" ? "IN" : "US";
      idsByMarket[m].push(row.instrument_id);
    }
    const [usDocs, inDocs] = await Promise.all([
      idsByMarket.US.length ? getLatestEarningsIntelForInstruments("US", idsByMarket.US).catch(() => [] as EarningsIntelDoc[]) : Promise.resolve([] as EarningsIntelDoc[]),
      idsByMarket.IN.length ? getLatestEarningsIntelForInstruments("IN", idsByMarket.IN).catch(() => [] as EarningsIntelDoc[]) : Promise.resolve([] as EarningsIntelDoc[]),
    ]);
    earningsReadyThisWeek = filterEarningsIntelThisWeek([...usDocs, ...inDocs]);
  }

  const pillarAverages = computePillarAverages(rows);
  const factorTilt = asDict(portfolio.factor_tilt);
  const activityEvents = buildActivityEvents(eventRadar, brief);
  const { yourBook: yourBookEvents, marketWide: marketWideEvents } =
    partitionActivityEvents(activityEvents);

  const userInfo = users.find((u) => u.uid === userId);

  return (
    <div className="flex h-full w-full">
      <DevWatchlistPicker users={users} initialUserId={userId} />
      <main className="flex flex-1 flex-col overflow-y-auto bg-white">
        <style>{tapeStyles}</style>
        <div className="mx-auto w-full max-w-screen-2xl px-6 py-6 md:px-10 lg:px-16 flex flex-col gap-2">
          {/* Dev user badge */}
          <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#fafaf7] px-3 py-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Dev Console</span>
            <span aria-hidden className="h-3 w-px bg-[#d1d5db]" />
            {userInfo?.photo_url ? (
              <img src={userInfo.photo_url} alt="" className="h-5 w-5 rounded-full" />
            ) : null}
            <span className="text-[12px] font-semibold text-[#0a0a0a]">{userInfo?.display_name || userInfo?.email || userId}</span>
            {userInfo?.subscriptionPlan && (
              <span className="rounded bg-[#ecfdf5] px-1.5 py-0.5 text-[9px] font-semibold text-[#047857] uppercase">{userInfo.subscriptionPlan}</span>
            )}
            {userInfo?.subscriptionStatus && (
              <span className="rounded bg-[#eff6ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#1e3a8a] uppercase">{userInfo.subscriptionStatus}</span>
            )}
            <span className="text-[10px] text-[#9ca3af] ml-auto">
              {tracked.length} tracked · v{userData.watchlist_version || 0}
              {builtAt ? ` · ${formatRelative(builtAt)}` : ""}
            </span>
          </div>

          {/* The full Radar — exactly as the user sees it */}
          <div className="flex flex-col gap-1">
            <HeaderStrip
              rows={rows} builtAt={builtAt} pulse={pulse}
              tapeItems={tapeItems} isSubscribed={true}
              trackedCount={tracked.length} searchIndex={searchIndex}
              watchlistPositions={watchlistPositions}
            />
            <YourBookSection
              holdings={holdings} watching={watching} upNext={upNext}
              earningsReadyThisWeek={earningsReadyThisWeek} bookEvents={yourBookEvents}
              suggestions={suggestions} isSubscribed={true}
              trackedCount={tracked.length} portfolio={portfolio}
            />
            <TodaySection
              brief={brief} topDirective={topDirective}
              secondaryDirectives={secondaryDirectives} suggestions={suggestions}
              marketEvents={marketWideEvents}
              trackedIds={new Set(tracked)}
            />
            <DiagnosisSection
              portfolio={portfolio} pillarAverages={pillarAverages}
              factorTilt={factorTilt} suggestions={suggestions}
              tracked={tracked} isSubscribed={true}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
