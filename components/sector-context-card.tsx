import type { SectorContextDoc } from "@/lib/sector";
import type { SectorStock } from "@/components/sector-stocks-treemap";

type Props = {
  sector: SectorContextDoc;
  sectorStocks?: SectorStock[];
};

function Card({
  emoji,
  iconBg,
  label,
  labelColor,
  count,
  children,
}: {
  emoji: string;
  iconBg: string;
  label: string;
  labelColor: string;
  count?: number | string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[16px]"
          style={{ background: iconBg }}
          aria-hidden
        >
          {emoji}
        </span>
        <h4
          className="text-[13px] font-semibold tracking-[-0.01em]"
          style={{ color: labelColor }}
        >
          {label}
        </h4>
        {count !== undefined && count !== "" && (
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-[#f3f4f6] text-[11px] font-semibold tabular-nums text-[#6b7280]">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function MoverList({ movers, tone }: { movers: SectorStock[]; tone: "bull" | "bear" }) {
  const toneClass = tone === "bull" ? "text-[#10b981]" : "text-[#ef4444]";
  if (movers.length === 0) {
    return <span className="text-[13px] text-[#6b7280]">—</span>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {movers.map((m) => (
        <li
          key={m.instrument_id}
          className="flex items-baseline justify-between gap-2 text-[13px]"
        >
          <span className="font-semibold text-[#111111] truncate">{m.ticker}</span>
          <span className={`font-semibold tabular-nums ${toneClass}`}>
            {m.changePct >= 0 ? "+" : ""}
            {m.changePct.toFixed(2)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SectorContextCard({ sector, sectorStocks = [] }: Props) {
  const vs = sector.visual_summary ?? {};
  const headline = (vs.what_changed ?? sector.today_brief ?? "").trim();
  const bull = (vs.bull_case ?? "").trim();
  const bear = (vs.bear_case ?? "").trim();
  const crowdMiss = (vs.crowd_miss ?? "").trim();
  const watch = (vs.what_to_watch ?? sector.what_to_watch ?? "").trim();

  const sorted = [...sectorStocks].sort((a, b) => b.changePct - a.changePct);
  const leaders = sorted.filter((s) => s.changePct > 0).slice(0, 3);
  const laggards = sorted.filter((s) => s.changePct < 0).slice(-3).reverse();
  const hasNarrative = Boolean(headline || bull || bear || crowdMiss || watch);

  return (
    <section className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em] truncate">
            {sector.sector_label}
          </h3>
          {sector.today_label && (
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
              · {sector.today_label}
            </span>
          )}
        </div>
        {sector.article_count != null && (
          <span className="text-[12px] text-[#6b7280] whitespace-nowrap">
            {sector.article_count} article{sector.article_count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {!hasNarrative && (
        <p className="text-[14px] text-[#6b7280]">
          No sector narrative for this run yet.
        </p>
      )}

      {headline && (
        <p className="text-[15px] text-[#111111] leading-relaxed font-medium max-w-[760px]">
          {headline}
        </p>
      )}

      {/* Bull / Bear cases */}
      {(bull || bear) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bull && (
            <Card emoji="🐂" iconBg="#ecfdf5" label="Bull case" labelColor="#10b981">
              <p className="text-[13px] text-[#111111] leading-snug">{bull}</p>
            </Card>
          )}
          {bear && (
            <Card emoji="🐻" iconBg="#fef2f2" label="Bear case" labelColor="#ef4444">
              <p className="text-[13px] text-[#111111] leading-snug">{bear}</p>
            </Card>
          )}
        </div>
      )}

      {/* Leaders / Laggards */}
      {(leaders.length > 0 || laggards.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card
            emoji="🚀"
            iconBg="#ecfdf5"
            label="Leading"
            labelColor="#10b981"
            count={leaders.length}
          >
            <MoverList movers={leaders} tone="bull" />
          </Card>
          <Card
            emoji="📉"
            iconBg="#fef2f2"
            label="Lagging"
            labelColor="#ef4444"
            count={laggards.length}
          >
            <MoverList movers={laggards} tone="bear" />
          </Card>
        </div>
      )}

      {/* Crowd miss + Watch */}
      {(crowdMiss || watch) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {crowdMiss && (
            <Card emoji="🔍" iconBg="#eff6ff" label="Crowd miss" labelColor="#0052ff">
              <p className="text-[13px] text-[#374151] leading-snug">{crowdMiss}</p>
            </Card>
          )}
          {watch && (
            <Card emoji="⏰" iconBg="#fef3c7" label="Watch" labelColor="#b45309">
              <p className="text-[13px] text-[#111111] leading-snug">{watch}</p>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
