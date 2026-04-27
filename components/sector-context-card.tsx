import type { SectorContextDoc } from "@/lib/sector";
import type { SectorStock } from "@/components/sector-stocks-treemap";

type Props = {
  sector: SectorContextDoc;
  // Live sector constituents (from the page's market snapshot) — used to
  // surface real leaders/laggards alongside the LLM's narrative. If the page
  // doesn't have this data (rare), the section quietly drops out.
  sectorStocks?: SectorStock[];
};

// ─── Component ────────────────────────────────────────────────────────────────
//
// The backend prompt is the single source of truth for content hygiene —
// no placeholders, no paraphrase across fields, every line names a ticker
// or a number. This component just renders what comes back. If a field is
// empty we drop the row rather than patching the string client-side.

export function SectorContextCard({ sector, sectorStocks = [] }: Props) {
  const vs = sector.visual_summary ?? {};
  const headline = (vs.what_changed ?? sector.today_brief ?? "").trim();
  const bull = (vs.bull_case ?? "").trim();
  const bear = (vs.bear_case ?? "").trim();
  const crowdMiss = (vs.crowd_miss ?? "").trim();
  const watch = (vs.what_to_watch ?? sector.what_to_watch ?? "").trim();

  // Live leaders / laggards — top 3 movers each way in this sector today.
  // Computed from real price data, so the panel stays honest even when the
  // LLM's bull/bear framing is stale.
  const sorted = [...sectorStocks].sort((a, b) => b.changePct - a.changePct);
  const leaders = sorted.filter((s) => s.changePct > 0).slice(0, 3);
  const laggards = sorted
    .filter((s) => s.changePct < 0)
    .slice(-3)
    .reverse();

  const hasNarrative = Boolean(headline || bull || bear || crowdMiss || watch);

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-5">
      {/* ─── Header strip ─────────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
            Sector brief
          </span>
          <span className="text-[14px] font-semibold text-on-surface truncate">
            {sector.sector_label}
          </span>
          {sector.today_label && (
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-on-surface-variant">
              · {sector.today_label}
            </span>
          )}
        </div>
        {sector.article_count != null && (
          <span className="text-[10px] text-on-surface-variant whitespace-nowrap">
            {sector.article_count} article{sector.article_count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {!hasNarrative && (
        <p className="text-sm text-on-surface-variant">
          No sector narrative for this run yet.
        </p>
      )}

      {/* ─── Headline: the one-sentence story ─────────────────────────── */}
      {headline && (
        <p className="text-sm text-on-surface leading-relaxed font-medium">
          {headline}
        </p>
      )}

      {/* ─── Bull vs Bear split ───────────────────────────────────────── */}
      {(bull || bear) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bull && (
            <div className="flex flex-col gap-1.5 border-l-2 border-signal-bullish/60 pl-3">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-signal-bullish">
                Bull case
              </span>
              <p className="text-[13px] text-on-surface leading-snug">{bull}</p>
            </div>
          )}
          {bear && (
            <div className="flex flex-col gap-1.5 border-l-2 border-signal-bearish/60 pl-3">
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-signal-bearish">
                Bear case
              </span>
              <p className="text-[13px] text-on-surface leading-snug">{bear}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Live leaders / laggards ──────────────────────────────────── */}
      {(leaders.length > 0 || laggards.length > 0) && (
        <div className="grid grid-cols-2 gap-4 border-t border-outline-variant/20 pt-3">
          <MoverList label="Leading" tone="bull" movers={leaders} />
          <MoverList label="Lagging" tone="bear" movers={laggards} />
        </div>
      )}

      {/* ─── What the crowd's missing ─────────────────────────────────── */}
      {crowdMiss && (
        <div className="flex items-start gap-2 border-t border-outline-variant/20 pt-3">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-primary shrink-0 mt-0.5">
            Crowd miss
          </span>
          <p className="text-[13px] text-on-surface-variant leading-snug">{crowdMiss}</p>
        </div>
      )}

      {/* ─── What to watch ────────────────────────────────────────────── */}
      {watch && (
        <div className="flex items-start gap-2 border-t border-outline-variant/20 pt-3">
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-amber-600 shrink-0 mt-0.5">
            Watch
          </span>
          <p className="text-[13px] text-on-surface leading-snug">{watch}</p>
        </div>
      )}
    </section>
  );
}

// ─── Leaders / laggards sub-component ────────────────────────────────────────

function MoverList({
  label,
  tone,
  movers,
}: {
  label: string;
  tone: "bull" | "bear";
  movers: SectorStock[];
}) {
  const toneClass = tone === "bull" ? "text-signal-bullish" : "text-signal-bearish";
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`text-[10px] font-bold tracking-[0.15em] uppercase ${toneClass}`}>
        {label}
      </span>
      {movers.length === 0 ? (
        <span className="text-[12px] text-on-surface-variant">—</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {movers.map((m) => (
            <li
              key={m.instrument_id}
              className="flex items-baseline justify-between gap-2 text-[12px]"
            >
              <span className="font-bold text-on-surface tabular-nums truncate">
                {m.ticker}
              </span>
              <span className={`font-bold tabular-nums ${toneClass}`}>
                {m.changePct >= 0 ? "+" : ""}
                {m.changePct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
