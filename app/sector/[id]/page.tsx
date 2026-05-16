import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { getMarketSnapshot } from "@/lib/firestore";
import { getSectorContextDoc } from "@/lib/sector";
import { getStockSummary, type StockSummary } from "@/lib/stock";
import { getCurrentMarket } from "@/lib/market";

export const revalidate = 60;

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const market = getCurrentMarket();
  let doc = await getSectorContextDoc(id, market).catch(() => null);
  if (!doc) {
    try { doc = await getSectorContextDoc(id, market === "US" ? "IN" : "US").catch(() => null); } catch {}
  }
  const label = doc?.sector_label ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const brief = doc?.today_brief?.slice(0, 150) ?? `Sector analysis and constituent stock performance for ${label}.`;
  return {
    title: `${label} - Sector Brief`,
    description: brief,
    alternates: { canonical: `/sector/${id}` },
    openGraph: {
      title: `${label} - Sector Brief · tikrr`,
      description: brief,
      url: `https://www.tikrr.online/sector/${id}`,
    },
    twitter: {
      title: `${label} - Sector Brief · tikrr`,
      description: brief,
    },
  };
}

function toneForLabel(label?: string): { color: string; chipBg: string; softBg: string } {
  const l = (label ?? "").toLowerCase();
  if (l.includes("construct") || l.includes("bull") || l.includes("risk-on")) {
    return {
      color: "var(--signal-bullish)",
      chipBg: "bg-signal-bullish/15",
      softBg: "bg-signal-bullish/5",
    };
  }
  if (l.includes("bear") || l.includes("risk-off") || l.includes("stress") || l.includes("cautious")) {
    return {
      color: "var(--signal-bearish)",
      chipBg: "bg-signal-bearish/15",
      softBg: "bg-signal-bearish/5",
    };
  }
  return {
    color: "var(--signal-neutral)",
    chipBg: "bg-signal-neutral/20",
    softBg: "bg-signal-neutral/5",
  };
}

function formatRelative(iso?: string): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function ContextCard({
  label,
  body,
  accent,
}: {
  label: string;
  body: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-5 bg-surface-container-low brutalist-border">
      <span className="text-[11px] font-semibold" style={{ color: accent }}>
        {label}
      </span>
      <p className="text-[14px] text-on-surface leading-relaxed">{body}</p>
    </div>
  );
}

function ConstituentCard({ stock }: { stock: StockSummary }) {
  const pct = stock.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;
  const arrow = positive ? "▲" : "▼";
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";
  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="group bg-surface-container-low p-4 brutalist-border hover:-translate-y-0.5 transition-transform"
    >
      <div className="text-[14px] font-bold text-on-surface group-hover:text-primary transition-colors">
        {stock.ticker}
      </div>
      <div className="text-[11px] font-semibold text-on-surface-variant truncate">
        {stock.name}
      </div>
      {typeof stock.price === "number" && (
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-on-surface tabular-nums">
            {stock.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {hasPct && (
            <span className={`text-[12px] font-bold tabular-nums ${color}`}>
              {arrow} {Math.abs(pct!).toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export default async function SectorPage({ params }: Props) {
  const { id } = await params;
  const market = getCurrentMarket();
  const sectorId = decodeURIComponent(id).toLowerCase();
  const doc = await getSectorContextDoc(sectorId, market);
  if (!doc) notFound();

  const tone = toneForLabel(doc.today_label);
  const weekTone = toneForLabel(doc.week_label);
  const visual = doc.visual_summary ?? {
    what_changed: doc.what_changed,
    why_it_matters: doc.why_it_matters,
    what_to_watch: doc.what_to_watch,
  };
  const hasVisual =
    !!(visual.what_changed || visual.why_it_matters || visual.what_to_watch);
  const hasWeek =
    !!(doc.week_brief || doc.week_label || typeof doc.week_score === "number");

  const tickers = (doc.distinct_tickers ?? []).slice(0, 24);
  const tickerOrder = new Map(tickers.map((t, index) => [String(t).toUpperCase(), index]));
  const snapshotRows = await getMarketSnapshot(market).catch(() => []);
  let constituents: StockSummary[] = snapshotRows
    .filter((row) => tickerOrder.has(String(row.symbol ?? "").toUpperCase()))
    .sort(
      (a, b) =>
        (tickerOrder.get(String(a.symbol ?? "").toUpperCase()) ?? 0) -
        (tickerOrder.get(String(b.symbol ?? "").toUpperCase()) ?? 0),
    )
    .map((row) => ({
      instrument_id: row.instrumentId,
      ticker: row.symbol,
      name: row.name || row.symbol,
      price: row.price.current,
      day_change_abs: row.price.change,
      day_change_pct: row.price.changePct,
      previous_close: row.price.previousClose,
      source: "snapshot" as const,
      fundamentals: null,
    }));

  // Preserve the old behavior if the sharded market snapshot has not been built.
  if (constituents.length === 0 && tickers.length > 0) {
    constituents = (
      await Promise.all(
        tickers.map((t) => getStockSummary(t, market).catch(() => null)),
      )
    ).filter((x): x is StockSummary => !!x);
  }

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 flex flex-col gap-8">
        <nav className="text-[11px] text-on-surface-variant">
          <Link href="/" className="hover:text-on-surface">
            Markets
          </Link>
          <span className="px-2">/</span>
          <span className="text-on-surface">{doc.sector_label}</span>
        </nav>

        <section className="bg-surface-container-lowest brutalist-border p-8 md:p-10 flex flex-col gap-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span
                className="w-2 h-2 animate-pulse"
                style={{ backgroundColor: tone.color }}
                aria-hidden="true"
              />
              <h3 className="text-[12px] font-semibold tracking-wide uppercase text-on-surface-variant">
                Sector Briefing · Today
              </h3>
            </div>
            {doc.today_label && (
              <span
                className={`px-3 py-1 text-[11px] font-semibold tracking-wide uppercase rounded-sm ${tone.chipBg}`}
                style={{ color: tone.color }}
              >
                {doc.today_label}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-4 flex-wrap">
            <h1 className="text-[40px] md:text-[52px] font-bold tracking-[-0.02em] leading-none text-on-surface">
              {doc.sector_label}
            </h1>
            {typeof doc.today_score === "number" && (
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-[32px] font-bold tabular-nums leading-none"
                  style={{ color: tone.color }}
                >
                  {Math.round(doc.today_score)}
                </span>
                <span className="text-[12px] font-semibold text-on-surface-variant">
                  / 100
                </span>
              </div>
            )}
          </div>

          {doc.today_brief && (
            <p className="text-[20px] md:text-[22px] leading-snug text-on-surface font-medium tracking-[-0.01em] max-w-[68ch]">
              {doc.today_brief}
            </p>
          )}

          {hasVisual && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visual.what_changed && (
                <ContextCard
                  label="What changed"
                  body={visual.what_changed}
                  accent="var(--primary)"
                />
              )}
              {visual.why_it_matters && (
                <ContextCard
                  label="Why it matters"
                  body={visual.why_it_matters}
                  accent="var(--signal-bullish)"
                />
              )}
              {visual.what_to_watch && (
                <ContextCard
                  label="What to watch"
                  body={visual.what_to_watch}
                  accent="var(--signal-neutral)"
                />
              )}
            </div>
          )}

          {hasWeek && (
            <div className={`flex flex-col gap-3 p-6 brutalist-border ${weekTone.softBg}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-semibold tracking-wide uppercase text-on-surface-variant">
                  This week
                </span>
                {doc.week_label && (
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-sm ${weekTone.chipBg}`}
                    style={{ color: weekTone.color }}
                  >
                    {doc.week_label}
                  </span>
                )}
                {typeof doc.week_score === "number" && (
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: weekTone.color }}
                  >
                    {Math.round(doc.week_score)} / 100
                  </span>
                )}
              </div>
              {doc.week_brief && (
                <p className="text-[14px] text-on-surface leading-relaxed max-w-[68ch]">
                  {doc.week_brief}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-2">
            <span>
              {typeof doc.article_count === "number"
                ? `${doc.article_count} verified sources`
                : "Synthesized briefing"}
            </span>
            {doc.generated_at && <span>Updated {formatRelative(doc.generated_at)}</span>}
          </div>
        </section>

        {constituents.length > 0 && (
          <section className="bg-surface-container-lowest brutalist-border p-6">
            <h2 className="text-[14px] font-semibold text-on-surface mb-4">
              Stocks in this sector
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {constituents.map((s) => (
                <ConstituentCard key={s.instrument_id} stock={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
