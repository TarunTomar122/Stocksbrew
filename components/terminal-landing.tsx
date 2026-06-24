import Link from "next/link";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import { ProPlanPicker } from "@/components/pro-plan-picker";
import { LandingScannerReddit } from "@/components/landing-scanner-reddit";
import { LandingHeroCommand } from "@/components/landing-hero-command";
import { LandingSectorHeat } from "@/components/landing-sector-heat";
import { HERO_HEADLINE_LEAD } from "@/lib/brand-copy";
import type { StockTier } from "@/lib/ai-launch-tier";

// ---- helpers --------------------------------------------------------------
const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const CYAN = "#22d3ee";

function anomalyTag(a: AnomalyItem): string {
  return (a.catalyst || a.move_explanation?.headline || a.visual_summary?.what_changed || "").trim();
}

type RedditPick = { ticker: string; sentiment: string; summary: string; mention_count?: number };
type SnapRow = { symbol: string; instrumentId?: string; name?: string; price?: { current?: number; changePct?: number } };

const SECTORS: { label: string; tickers: string[] }[] = [
  { label: "Tech", tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "ADBE", "CRM"] },
  { label: "Semis", tickers: ["NVDA", "AMD", "AVGO", "TSM", "MU", "INTC", "QCOM", "ARM", "SMCI", "MRVL"] },
  { label: "Industrials", tickers: ["CAT", "GE", "HON", "RTX", "BA", "MMM", "ETN", "DE"] },
  { label: "Finance", tickers: ["JPM", "BAC", "GS", "MS", "WFC", "V", "MA", "AXP"] },
];

export function TerminalLanding({
  anomalies,
  reddit = [],
  snapshotRows = [],
  isSubscribed = false,
  featuredTracked = false,
  featuredTier = "free",
  trackedIds = [],
}: {
  anomalies: AnomalyItem[];
  reddit?: RedditPick[];
  snapshotRows?: SnapRow[];
  isSubscribed?: boolean;
  featuredTracked?: boolean;
  featuredTier?: StockTier;
  trackedIds?: string[];
}) {
  const featured = anomalies[0];
  const redditPicks = reddit.filter((r) => r.summary?.trim()).slice(0, 8);

  // sector heat from snapshot rows + fixed sector lists
  const bySym = new Map<string, SnapRow>();
  for (const r of snapshotRows) if (r.symbol) bySym.set(r.symbol.toUpperCase(), r);
  const sectorCards = SECTORS.map(({ label, tickers }) => {
    const stocks = tickers
      .map((t) => bySym.get(t))
      .filter((r): r is SnapRow => Boolean(r) && n(r!.price?.changePct))
      .map((r) => ({
        ticker: r!.symbol,
        instrumentId: r!.instrumentId || `US_${r!.symbol}`,
        changePct: r!.price!.changePct!,
      }))
      .sort((a, b) => b.changePct - a.changePct);
    const avg = stocks.length ? stocks.reduce((s, x) => s + x.changePct, 0) / stocks.length : 0;
    return { label, avg, stocks: stocks.slice(0, 8) };
  }).filter((c) => c.stocks.length > 0);
  const fMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v: number) => `${v >= 0 ? "▲" : "▼"}${Math.abs(v).toFixed(2)}%`;

  // ticker tape strip (real movers)
  const tape = anomalies.slice(0, 14);
  const tapeStrip = (
    <span className="flex gap-7 px-3">
      {tape.map((a) => {
        const u = a.day_change_pct >= 0;
        return (
          <span key={a.ticker} className="text-on-surface-variant">
            {a.ticker} <b style={{ color: u ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>${fMoney(a.price)} {pct(a.day_change_pct)}</b>
          </span>
        );
      })}
    </span>
  );

  return (
    <div className="bg-background text-on-surface">
      {/* TICKER TAPE */}
      {tape.length > 0 && (
        <div className="overflow-hidden border-b py-2 font-mono text-[12px]" style={{ borderColor: "var(--outline-variant)" }}>
          <div className="sb-tape">{tapeStrip}<span aria-hidden>{tapeStrip}</span></div>
        </div>
      )}

      {/* HERO */}
      <header className="relative border-b border-outline-variant">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 md:py-28 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[12px]" style={{ borderColor: "color-mix(in srgb, var(--signal-bullish) 30%, transparent)", color: "var(--signal-bullish)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--signal-bullish)" }} /> live // {anomalies.length > 0 ? `${(4800 + anomalies.length).toLocaleString()}` : "4,800+"} tickers indexed
            </div>
            <h1 className="font-sans text-4xl font-extrabold leading-[1.05] tracking-tight text-on-surface sm:text-5xl lg:text-[3.4rem]">
              {HERO_HEADLINE_LEAD}
              <span className="block" style={{ color: "var(--signal-bullish)" }}>and what to do next.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-on-surface-variant">
              Add a ticker to Radar and get a clear <b className="text-on-surface">buy, hold, sell, or watch</b> call with the reasons behind every move. Free for your first <b className="font-mono text-on-surface">3 stocks</b>, no card required.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/watchlist" className="rounded px-6 py-3 font-mono text-sm font-bold" style={{ background: "var(--signal-bullish)", color: "var(--background)" }}>track your first stock →</Link>
              <Link href="/pulse" className="rounded border border-outline-variant px-6 py-3 font-mono text-sm text-on-surface hover:text-on-surface" style={{ borderColor: "var(--outline-variant)" }}>see today&apos;s movers</Link>
            </div>
          </div>

          {featured && (
            <LandingHeroCommand
              featured={{
                instrument_id: featured.instrument_id,
                ticker: featured.ticker,
                name: featured.name,
                price: featured.price,
                day_change_pct: featured.day_change_pct,
                overall_score: featured.overall_score,
                overall_label: featured.overall_label,
                key_points: featured.key_points ?? [],
              }}
              isSubscribed={isSubscribed}
              isTracked={featuredTracked}
              tier={featuredTier}
            />
          )}
        </div>
      </header>

      {/* WHAT'S MOVING + REDDIT BUZZ */}
      {anomalies.length > 0 && (
        <LandingScannerReddit
          scannerItems={anomalies.map((a) => ({ ticker: a.ticker, price: a.price, changePct: a.day_change_pct, tag: anomalyTag(a) }))}
          redditPicks={redditPicks}
        />
      )}

      {/* SECTOR HEAT */}
      {sectorCards.length > 0 && (
        <LandingSectorHeat sectors={sectorCards} trackedIds={trackedIds} isSubscribed={isSubscribed} />
      )}

      {/* PRO — plans inline, no extra screen */}
      <section>
        <div className="mx-auto max-w-2xl px-5 py-24 text-center">
          <p className="mb-3 font-mono text-[11px] tracking-[0.2em]" style={{ color: "var(--signal-bullish)" }}>STOCKSBREW PRO</p>
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface sm:text-4xl">Know what to do with the<br />stocks you care about.</h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-on-surface-variant">Track unlimited names. Get the buy/sell/hold call, the full why on every mover, and the Reddit read, the moment your stocks move.</p>

          <ProPlanPicker />
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="border-t border-outline-variant">
        <div className="mx-auto max-w-7xl px-5 py-24">
          <div className="mb-1 font-mono text-[12px]" style={{ color: CYAN }}>// the desk</div>
          <h2 className="mb-8 text-2xl font-extrabold text-on-surface sm:text-3xl">What traders are saying</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              "The verdict and the why in one place. I stopped doom-scrolling five tabs every morning.",
              "The sector flow and Reddit read used to take me an hour to assemble. Now it's just there.",
              "Got pinged the morning NVDA broke down with the actual reason. That alert paid for the year.",
            ].map((quote, i) => (
              <div key={i} className="panel p-6">
                <p className="text-[15px] leading-relaxed text-on-surface">&ldquo;{quote}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
