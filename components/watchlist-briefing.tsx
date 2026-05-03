import type { WatchlistBrief, WatchlistRow } from "@/lib/watchlist-view";

type Props = {
  brief?: WatchlistBrief | null;
  rows: WatchlistRow[];
};

const VIBE_CLASS: Record<string, string> = {
  up: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
  down: "border-rose-500/25 bg-rose-500/10 text-rose-700",
  wild: "border-amber-500/25 bg-amber-500/10 text-amber-700",
  positive: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
  negative: "border-rose-500/25 bg-rose-500/10 text-rose-700",
  neutral: "border-outline-variant/50 bg-surface-container-low text-on-surface-variant",
};

function toneClass(vibe?: string) {
  return VIBE_CLASS[vibe || "neutral"] ?? VIBE_CLASS.neutral;
}

function statusCopy(brief?: WatchlistBrief | null) {
  if (brief?.status === "ready") return "Personalized AI";
  if (brief?.status === "pending") return "AI refresh pending";
  return "Rules fallback";
}

function rowByTicker(rows: WatchlistRow[]) {
  return new Map(rows.map((row) => [row.ticker, row]));
}

function ScorePill({ row }: { row?: WatchlistRow }) {
  if (!row) return null;
  if (row.scores.overall === null) {
    return (
      <span className="rounded-full border border-outline-variant/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
        Score pending
      </span>
    );
  }
  return (
    <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-on-surface">
      Score {Math.round(row.scores.overall)}
    </span>
  );
}

export function WatchlistBriefing({ brief, rows }: Props) {
  if (!brief || rows.length === 0) return null;

  const lookup = rowByTicker(rows);
  const tiles = brief.tiles?.length
    ? brief.tiles
    : rows.map((row) => ({
        ticker: row.ticker,
        micro: row.brief_tile.micro,
        vibe: row.brief_tile.vibe,
      }));
  const events = brief.essential_events?.slice(0, 5) ?? [];
  const signals = brief.signals?.slice(0, 3) ?? [];

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-outline-variant/40 bg-surface-container-lowest shadow-card">
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="border-b border-outline-variant/30 p-5 md:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                Radar intelligence
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-on-surface">
                {brief.narrative || "Your portfolio read is ready."}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
              {statusCopy(brief)}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {tiles.slice(0, 6).map((tile) => {
              const row = lookup.get(tile.ticker);
              return (
                <article
                  key={tile.ticker}
                  className="rounded-2xl border border-outline-variant/35 bg-surface p-4 transition-all hover:border-outline/70 hover:shadow-card"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-on-surface">
                        {tile.ticker}
                      </div>
                      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                        {row?.sector_label || row?.market || "In Radar"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScorePill row={row} />
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${toneClass(tile.vibe)}`}>
                        {tile.vibe}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] font-semibold leading-snug text-on-surface">
                    {tile.micro}
                  </p>
                  {row?.coverage_status === "score_pending" && (
                    <p className="mt-2 text-[11px] leading-snug text-on-surface-variant">
                      Price is live; scorecard and deeper AI coverage will attach after the next refresh.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="grid grid-cols-1 divide-y divide-outline-variant/30">
          <div className="p-5 md:p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
              Blind spot
            </div>
            <h3 className="mt-2 text-lg font-black tracking-tight text-on-surface">
              {brief.blind_spot_title || "Exposure check"}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
              {brief.blind_spot_body}
            </p>
          </div>

          {events.length > 0 && (
            <div className="p-5 md:p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
                Key events
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {events.map((event, index) => (
                  <div
                    key={`${event.symbol}-${event.sentence}-${index}`}
                    className="rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">
                        {event.symbol || event.event_type}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-on-surface-variant">
                        Impact {Math.round(event.impact_score ?? 0)}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] font-semibold leading-snug text-on-surface">
                      {event.sentence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {signals.length > 0 && (
            <div className="p-5 md:p-6">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-on-surface-variant">
                Portfolio forces
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {signals.map((signal) => (
                  <div key={`${signal.tag}-${signal.headline}`} className="rounded-xl bg-surface-container-low p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">
                        {signal.tag}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] ${toneClass(signal.vibe)}`}>
                        {signal.vibe}
                      </span>
                    </div>
                    <h4 className="mt-2 text-[13px] font-black text-on-surface">
                      {signal.headline}
                    </h4>
                    <p className="mt-1 text-[12px] leading-snug text-on-surface-variant">
                      {signal.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
