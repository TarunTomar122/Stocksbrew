import Link from "next/link";

import type { DivergenceList, DivergenceRow } from "@/lib/divergence";

function fmtPct(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtScore(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  return v.toFixed(2);
}

function toneFor(row: DivergenceRow): {
  label: string;
  chip: string;
  accent: string;
} {
  if (row.direction === "bullish_news_price_down") {
    return {
      label: "Bullish news, price down",
      chip: "bg-signal-bullish/10 text-signal-bullish border-signal-bullish/30",
      accent: "text-signal-bullish",
    };
  }
  return {
    label: "Bearish news, price up",
    chip: "bg-signal-bearish/10 text-signal-bearish border-signal-bearish/30",
    accent: "text-signal-bearish",
  };
}

function DivergenceCard({ row, rank }: { row: DivergenceRow; rank: number }) {
  const tone = toneFor(row);
  const leadArticle = row.articles?.[0];
  return (
    <article className="group bg-surface-container-lowest brutalist-border p-5 hover:-translate-y-0.5 transition-transform">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black tabular-nums text-outline">
              {String(rank).padStart(2, "0")}
            </span>
            <span className={`px-2 py-0.5 border text-[10px] font-bold tracking-[0.12em] uppercase ${tone.chip}`}>
              {tone.label}
            </span>
          </div>
          <Link
            href={`/stock/${encodeURIComponent(row.ticker)}`}
            className="mt-2 block text-lg font-black tracking-tight text-on-surface group-hover:text-primary transition-colors"
          >
            {row.ticker}
            <span className="ml-2 text-sm font-semibold text-on-surface-variant">
              {row.name}
            </span>
          </Link>
          {row.sector && (
            <p className="mt-1 text-[10px] font-semibold tracking-[0.1em] uppercase text-outline">
              {row.sector}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-on-surface-variant">
            Confidence
          </div>
          <div className="text-xl font-black tabular-nums text-primary">
            {Math.round(row.confidence)}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold text-on-surface">
        {row.headline}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
        {row.reason}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Price move" value={fmtPct(row.price_change_pct)} className={row.price_change_pct >= 0 ? "text-signal-bullish" : "text-signal-bearish"} />
        <Metric label="News sentiment" value={fmtScore(row.sentiment_score)} className={tone.accent} />
        <Metric label="Articles" value={`${row.article_count}`} />
      </div>

      {leadArticle?.title && (
        <div className="mt-4 border-t border-outline-variant/20 pt-3">
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-on-surface-variant">
            Lead read
          </p>
          {leadArticle.url ? (
            <a
              href={leadArticle.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-[13px] font-semibold text-on-surface hover:text-primary"
            >
              {leadArticle.title}
            </a>
          ) : (
            <p className="mt-1 text-[13px] font-semibold text-on-surface">
              {leadArticle.title}
            </p>
          )}
          {leadArticle.source_name && (
            <p className="mt-1 text-[11px] text-on-surface-variant">
              {leadArticle.source_name}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function Metric({
  label,
  value,
  className = "text-on-surface",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="bg-surface-container-low p-3">
      <div className="text-[9px] font-bold tracking-[0.14em] uppercase text-on-surface-variant">
        {label}
      </div>
      <div className={`mt-1 text-sm font-black tabular-nums ${className}`}>
        {value}
      </div>
    </div>
  );
}

export function DivergenceListView({ data }: { data: DivergenceList | null }) {
  if (!data || data.rows.length === 0) {
    return (
      <div className="bg-surface-container-lowest brutalist-border p-10">
        <div className="mx-auto max-w-xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[22px]">sync_alt</span>
          </div>
          <p className="mt-4 text-[12px] font-black tracking-[0.16em] uppercase text-on-surface">
            No price-news mismatch right now
          </p>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            We&apos;ll show names here when price action and recent news sentiment
            disagree strongly enough to be worth investigating.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {data.rows.map((row, index) => (
        <DivergenceCard key={row.instrument_id} row={row} rank={index + 1} />
      ))}
    </section>
  );
}
