import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getWatchlistView, rebuildAndSaveWatchlistView } from "@/lib/watchlist-view";
import { WatchlistPulse } from "@/components/watchlist-pulse";
import { WatchlistAlerts } from "@/components/watchlist-alerts";
import { WatchlistGrid } from "@/components/watchlist-grid";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/?signin=required");
  }

  const userDoc = await getUserDoc(session.uid);
  const tracked = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks! : [];
  const isSubscribed = resolveIsSubscribed(userDoc);

  // Single read: the pre-materialized view. No per-ticker fan-out at render time.
  let view = await getWatchlistView(session.uid);

  // Lazy build: if the user has never had a view (first visit), materialize
  // it once now so the page doesn't render empty.
  if (!view && tracked.length > 0) {
    view = await rebuildAndSaveWatchlistView(session.uid, tracked);
  }

  const rows = view?.rows ?? [];
  const pulse = view?.pulse ?? null;

  if (!isSubscribed) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-2xl px-8 py-12 flex flex-col gap-6">
          <header>
            <h1 className="text-2xl font-bold text-on-surface">Watchlist</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              A pro feature — track up to 10 stocks and get a twice-daily AI brief across them.
            </p>
          </header>
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent p-8">
            <h2 className="text-lg font-semibold text-on-surface">Upgrade to unlock</h2>
            <p className="text-sm text-on-surface-variant mt-2 max-w-xl">
              Subscribers can track any 10 stocks to a personal AI tier. Each refresh runs a
              dedicated news-backed brief, surfaces red-flag alerts (overbought RSI, earnings
              tomorrow, 52w lows), and produces a pulse summary across the whole list.
            </p>
            <Link
              href="/subscribe"
              className="inline-block mt-5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              See subscription options
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-8 py-12 flex flex-col gap-8">
        <header className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Watchlist</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {rows.length} of 10 slots used · refreshed {view ? formatRelative(view.built_at) : "never"}
            </p>
          </div>
        </header>

        {pulse && <WatchlistPulse pulse={pulse} />}

        <WatchlistAlerts rows={rows} />

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <WatchlistGrid rows={rows} />
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-10 text-center">
      <h2 className="text-base font-semibold text-on-surface">Nothing tracked yet</h2>
      <p className="text-sm text-on-surface-variant mt-2 max-w-md mx-auto">
        Open any stock detail page and hit <span className="font-semibold">Track this stock</span>{" "}
        to start getting twice-daily AI briefs tailored to your portfolio.
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
