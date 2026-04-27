import Link from "next/link";

import type { SnapshotRow } from "@/lib/types";

type Props = {
  instrumentIds: readonly string[];
  snapshotRows: SnapshotRow[];
};

// The launch-tier stocks — always-free AI briefs, surfaced on the home page
// as the "here's what you can read today without signing in" table. The right
// rail is the watchlist CTA; subscribers get a personal AI tier on top of this
// baseline, which is how we fund the per-ticker enrichment.
export function FreePicksRow({ instrumentIds, snapshotRows }: Props) {
  if (!instrumentIds.length) return null;

  const byId = new Map(snapshotRows.map((r) => [r.instrumentId, r]));
  const picks = instrumentIds
    .map((id) => byId.get(id))
    .filter((r): r is SnapshotRow => !!r);

  if (!picks.length) return null;

  return (
    <section className="bg-surface-container-lowest brutalist-border rounded-xl p-6 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-primary">
          Free AI Briefs
        </span>
        <h2 className="text-lg font-semibold text-on-surface">
          On the house — tracked for everyone
        </h2>
        <p className="text-[12px] text-on-surface-variant">
          News-backed AI reads refreshed twice daily on these {picks.length}{" "}
          stocks. No sign-in required.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock list — 2 columns on wide screens, 1 on mobile, takes 2/3. */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
            {picks.map((row) => (
              <PickRow key={row.instrumentId} row={row} />
            ))}
          </div>
        </div>

        {/* CTA rail — owns the remaining 1/3 on desktop. */}
        <WatchlistCTA />
      </div>
    </section>
  );
}

function PickRow({ row }: { row: SnapshotRow }) {
  const pct = row.price?.changePct;
  const price = row.price?.current;
  const up = typeof pct === "number" && pct > 0;
  const down = typeof pct === "number" && pct < 0;
  const toneClass = up
    ? "text-signal-bullish"
    : down
      ? "text-signal-bearish"
      : "text-on-surface-variant";
  const arrow = up ? "▲" : down ? "▼" : "•";

  return (
    <Link
      href={`/stock/${encodeURIComponent(row.symbol)}`}
      className="group flex items-center justify-between gap-3 py-3 border-b border-outline-variant/30 last:border-b-0 -mx-2 px-2 hover:bg-surface-container-low transition-colors cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-on-surface truncate group-hover:text-primary transition-colors">
          {row.symbol}
        </div>
        <div className="text-[11px] font-semibold text-on-surface-variant truncate">
          {row.name || row.symbol}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-semibold text-on-surface tabular-nums">
          {typeof price === "number"
            ? price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : "—"}
        </div>
        <div className={`text-[11px] font-bold tabular-nums ${toneClass}`}>
          {typeof pct === "number"
            ? `${arrow} ${Math.abs(pct).toFixed(2)}%`
            : "—"}
        </div>
      </div>
    </Link>
  );
}

function WatchlistCTA() {
  return (
    <div className="flex flex-col gap-4 bg-primary/[0.06] border border-primary/30 rounded-xl p-5">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-primary">
          Go Personal
        </span>
        <h3 className="text-[16px] font-semibold text-on-surface leading-snug">
          Build your own watchlist
        </h3>
        <p className="text-[12px] text-on-surface-variant leading-relaxed">
          Track up to 10 stocks and we&apos;ll run the same news-backed AI read
          on each — plus a cross-stock pulse that spots themes, overlaps, and
          blind spots across your picks.
        </p>
      </div>

      <ul className="flex flex-col gap-1.5 text-[12px] text-on-surface">
        <li className="flex items-start gap-2">
          <span className="text-primary text-[11px] mt-0.5">◆</span>
          <span>Full AI brief on every tracked stock, twice a day</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary text-[11px] mt-0.5">◆</span>
          <span>Watchlist pulse — what moved, what to act on</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary text-[11px] mt-0.5">◆</span>
          <span>Red-flag alerts before a position turns ugly</span>
        </li>
      </ul>

      <Link
        href="/watchlist"
        className="inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-[12px] font-bold tracking-[0.08em] uppercase rounded-full px-4 py-2.5 hover:bg-primary-container transition-colors"
      >
        Start your watchlist
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
