import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";

import { getMarketSnapshot } from "@/lib/firestore";
import { findAnomalyInFeed, getDailyAnomalies } from "@/lib/daily-anomalies";
import { getSectorContextDoc, getTrackedSectorMembers } from "@/lib/sector";
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
      title: `${label} - Sector Brief · stocksbrew`,
      description: brief,
      url: `https://www.stocksbrew.online/sector/${id}`,
    },
    twitter: {
      title: `${label} - Sector Brief · stocksbrew`,
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

function titleizeSector(input: string): string {
  return input
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fallbackSectorBrief(label: string, constituents: StockSummary[]): string | null {
  if (constituents.length === 0) return null;
  const withPct = constituents.filter((stock) => typeof stock.day_change_pct === "number");
  if (withPct.length === 0) return `${label} tracked names are active today, but live sector context is still sparse.`;
  const avg = withPct.reduce((sum, stock) => sum + (stock.day_change_pct || 0), 0) / withPct.length;
  const ups = withPct.filter((stock) => (stock.day_change_pct || 0) >= 0).length;
  const downs = withPct.length - ups;
  const sorted = [...withPct].sort((a, b) => Math.abs(b.day_change_pct || 0) - Math.abs(a.day_change_pct || 0));
  const leader = sorted[0];
  const tone = avg >= 0 ? "leaning higher" : "leaning lower";
  const move = typeof leader.day_change_pct === "number" ? `${leader.day_change_pct >= 0 ? "+" : ""}${leader.day_change_pct.toFixed(2)}%` : "today";
  return `${label} is ${tone} across tracked names today. ${ups} are up and ${downs} are down, with ${leader.ticker} setting the pace at ${move}.`;
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

function SectorTableRow({
  stock,
  signal,
}: {
  stock: StockSummary;
  signal: string | null;
}) {
  const pct = stock.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";

  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      className="grid gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-container sm:grid-cols-[96px_minmax(0,1.4fr)_120px_120px_minmax(0,2fr)] sm:items-center"
      style={{ borderColor: "var(--outline-variant)" }}
    >
      <div className="font-mono text-[13px] font-bold text-on-surface">{stock.ticker}</div>
      <div className="min-w-0">
        <p className="truncate text-[13px] text-on-surface">{stock.name}</p>
        {stock.industry ? (
          <p className="truncate text-[11px] text-on-surface-variant">{stock.industry}</p>
        ) : null}
      </div>
      <div className="font-mono text-[13px] tabular-nums text-on-surface">
        {typeof stock.price === "number"
          ? stock.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : "—"}
      </div>
      <div className={`font-mono text-[13px] font-bold tabular-nums ${hasPct ? color : "text-on-surface-variant"}`}>
        {hasPct ? `${positive ? "▲" : "▼"} ${Math.abs(pct!).toFixed(2)}%` : "—"}
      </div>
      <div className="min-w-0 text-[12px] text-on-surface-variant">
        <p className="truncate">{signal || "No standout anomaly read today."}</p>
      </div>
    </Link>
  );
}

export default async function SectorPage({ params }: Props) {
  const { id } = await params;
  const market = getCurrentMarket();
  const sectorId = decodeURIComponent(id).toLowerCase();
  const trackedMembers = getTrackedSectorMembers(sectorId, market);
  const doc = await getSectorContextDoc(sectorId, market);
  if (!doc && trackedMembers.length === 0) notFound();

  const sectorLabel = doc?.sector_label ?? titleizeSector(sectorId);
  const tone = toneForLabel(doc?.today_label);
  const weekTone = toneForLabel(doc?.week_label);
  const visual = doc?.visual_summary ?? {
    what_changed: doc?.what_changed,
    why_it_matters: doc?.why_it_matters,
    what_to_watch: doc?.what_to_watch,
  };
  const hasVisual =
    !!(visual.what_changed || visual.why_it_matters || visual.what_to_watch);
  const hasWeek =
    !!(doc?.week_brief || doc?.week_label || typeof doc?.week_score === "number");

  const trackedTickers = trackedMembers.map((row) => row.ticker);
  const fallbackTickers = (doc?.distinct_tickers ?? []).map((t) => String(t).toUpperCase());
  const tickers = (trackedTickers.length > 0 ? trackedTickers : fallbackTickers).slice(0, 40);
  const tickerOrder = new Map(tickers.map((t, index) => [String(t).toUpperCase(), index]));
  const snapshotRows = await getMarketSnapshot(market).catch(() => []);
  const anomalies = (await getDailyAnomalies(market).catch(() => null))?.anomalies ?? [];
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

  const signalByTicker = new Map(
    anomalies.map((row) => [
      String(row.ticker || "").toUpperCase(),
      row.move_explanation?.headline || row.headline || row.catalyst || row.visual_summary?.what_changed || null,
    ]),
  );
  const heroBrief = doc?.today_brief || fallbackSectorBrief(sectorLabel, constituents);

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12 flex flex-col gap-8">
        <nav className="text-[11px] text-on-surface-variant">
          <Link href="/" className="hover:text-on-surface">
            Markets
          </Link>
          <span className="px-2">/</span>
          <span className="text-on-surface">{sectorLabel}</span>
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
            {doc?.today_label && (
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
              {sectorLabel}
            </h1>
            {typeof doc?.today_score === "number" && (
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

          {heroBrief && (
            <p className="text-[20px] md:text-[22px] leading-snug text-on-surface font-medium tracking-[-0.01em] max-w-[68ch]">
              {heroBrief}
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
                {doc?.week_label && (
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-sm ${weekTone.chipBg}`}
                    style={{ color: weekTone.color }}
                  >
                    {doc.week_label}
                  </span>
                )}
                {typeof doc?.week_score === "number" && (
                  <span
                    className="text-[12px] font-bold tabular-nums"
                    style={{ color: weekTone.color }}
                  >
                    {Math.round(doc.week_score)} / 100
                  </span>
                )}
              </div>
              {doc?.week_brief && (
                <p className="text-[14px] text-on-surface leading-relaxed max-w-[68ch]">
                  {doc.week_brief}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-on-surface-variant pt-2">
            <span>
              {typeof doc?.article_count === "number"
                ? `${doc.article_count} verified sources`
                : doc
                  ? "Synthesized briefing"
                  : "Tracked sector basket"}
            </span>
            {doc?.generated_at && <span>Updated {formatRelative(doc.generated_at)}</span>}
          </div>
        </section>

        {constituents.length > 0 && (
          <>
            <section className="bg-surface-container-lowest brutalist-border p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-[14px] font-semibold text-on-surface">
                    Tracked names in this sector
                  </h2>
                  <p className="mt-1 text-[12px] text-on-surface-variant">
                    Live price action plus today&apos;s anomaly read when we have one.
                  </p>
                </div>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {constituents.length} tracked names
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--outline-variant)" }}>
                <div
                  className="hidden bg-surface-container px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-on-surface-variant sm:grid sm:grid-cols-[96px_minmax(0,1.4fr)_120px_120px_minmax(0,2fr)]"
                >
                  <span>Ticker</span>
                  <span>Company</span>
                  <span>Price</span>
                  <span>Day</span>
                  <span>Signal</span>
                </div>
                <div>
                  {constituents.map((stock) => (
                    <SectorTableRow
                      key={stock.instrument_id}
                      stock={stock}
                      signal={signalByTicker.get(stock.ticker.toUpperCase()) ?? null}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-surface-container-lowest brutalist-border p-6">
              <h2 className="mb-4 text-[14px] font-semibold text-on-surface">
                Quick tiles
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {constituents.map((s) => (
                  <ConstituentCard key={s.instrument_id} stock={s} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
