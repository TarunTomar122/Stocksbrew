import type { WatchlistPulse as PulseShape } from "@/lib/watchlist-view";

function StatTile({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
        {label}
      </span>
      <span className="text-lg font-bold text-on-surface tabular-nums">
        {value === null || value === undefined ? "-" : value}
      </span>
    </div>
  );
}

export function WatchlistPulse({ pulse }: { pulse: PulseShape }) {
  const stats = pulse.stats || {};
  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
            Pulse
          </div>
          <h2 className="mt-1 text-xl font-semibold text-on-surface">{pulse.headline}</h2>
          {pulse.subtitle && (
            <p className="mt-1 text-sm text-on-surface-variant">{pulse.subtitle}</p>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          <StatTile label="In Watchlist" value={stats.count ?? 0} />
          <StatTile label="Up today" value={stats.movers_up ?? 0} />
          <StatTile label="Down today" value={stats.movers_down ?? 0} />
          <StatTile label="Avg score" value={stats.avg_overall_score ?? null} />
        </div>
      </div>
    </section>
  );
}
