/**
 * Server-rendered cards for the stock detail page.
 * (Chart lives in price-chart.tsx because it's interactive.)
 */

import Link from "next/link";

import type { Sector, Stock } from "@/lib/api-types";
import type { YahooFundamentals } from "@/lib/yahoo-finance";
import type { DeltaCard } from "@/lib/delta-cards";

import {
  DashboardCard,
  formatCurrency,
  formatNumberCompact,
  formatPct,
  pctClass,
  ToneChip,
} from "./primitives";

/* ─── ScorecardBadge ─── */
type Verdict = "good" | "neutral" | "bad";

function badgeClass(v: Verdict): string {
  if (v === "good") return "border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)]";
  if (v === "bad") return "border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)]";
  return "border-[#252E42] bg-[#1A2130]";
}

function dotClass(v: Verdict): string {
  if (v === "good") return "bg-[#22C55E]";
  if (v === "bad") return "bg-[#EF4444]";
  return "bg-[#8C94A8]";
}

function verdictLabel(v: Verdict): string {
  if (v === "good") return "Good";
  if (v === "bad") return "Weak";
  return "Neutral";
}

function ScoreBadge({
  title,
  verdict,
  detail,
}: {
  title: string;
  verdict: Verdict;
  detail: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-[8px] border ${badgeClass(verdict)} p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#F5F6F8]">{title}</span>
        <span className="flex items-center gap-1 text-[10px] text-[#8C94A8]">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass(verdict)}`} />
          {verdictLabel(verdict)}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-[#8C94A8]">{detail}</p>
    </div>
  );
}

function derivePerformance(stock: Stock): { verdict: Verdict; detail: string } {
  const { fiftyTwoWeekHigh: hi, fiftyTwoWeekLow: lo } = stock.technicals;
  if (hi <= lo) return { verdict: "neutral", detail: "Insufficient range data." };
  const pos = (stock.price.current - lo) / (hi - lo);
  const pctLabel = `${(pos * 100).toFixed(0)}% of 52W range`;
  if (pos >= 0.75) return { verdict: "good", detail: `${pctLabel}, near highs.` };
  if (pos <= 0.3) return { verdict: "bad", detail: `${pctLabel}, near lows.` };
  return { verdict: "neutral", detail: `${pctLabel}, mid-range.` };
}

function deriveMomentum(stock: Stock): { verdict: Verdict; detail: string } {
  const rsi = stock.technicals.rsi14;
  const streak = stock.streak;
  if (rsi > 70)
    return { verdict: "bad", detail: `RSI ${rsi.toFixed(0)} — overbought.` };
  if (rsi > 0 && rsi < 30)
    return {
      verdict: "bad",
      detail: `RSI ${rsi.toFixed(0)} — oversold, but weak.`,
    };
  if (streak?.direction === "up" && streak.days >= 3 && rsi >= 50)
    return {
      verdict: "good",
      detail: `${streak.days}-day green streak. RSI ${rsi.toFixed(0)}.`,
    };
  if (streak?.direction === "down" && streak.days >= 3)
    return {
      verdict: "bad",
      detail: `${streak.days}-day red streak. RSI ${rsi.toFixed(0)}.`,
    };
  return {
    verdict: "neutral",
    detail: `RSI ${rsi.toFixed(0)}, no streak signal.`,
  };
}

function deriveValuation(
  stock: Stock,
  fund: YahooFundamentals | null,
): { verdict: Verdict; detail: string } {
  const pe = fund?.trailingPE;
  const up = stock.analystConsensus.upside;
  if (up >= 20)
    return {
      verdict: "good",
      detail: `Analyst upside ${formatPct(up)}${pe ? `, TTM PE ${pe.toFixed(1)}` : ""}.`,
    };
  if (up >= 5)
    return {
      verdict: "neutral",
      detail: `Analyst upside ${formatPct(up)}${pe ? `, TTM PE ${pe.toFixed(1)}` : ""}.`,
    };
  if (up < -5)
    return {
      verdict: "bad",
      detail: `Analyst sees downside ${formatPct(up)}.`,
    };
  return {
    verdict: "neutral",
    detail: pe ? `TTM PE ${pe.toFixed(1)}. Mixed consensus.` : "Mixed consensus.",
  };
}

function deriveEntry(stock: Stock): { verdict: Verdict; detail: string } {
  const rsi = stock.technicals.rsi14;
  const fromHigh = parseFloat(stock.technicals.fromHigh.replace("%", ""));
  const safeFromHigh = Number.isFinite(fromHigh) ? fromHigh : 0;
  if (rsi > 0 && rsi < 35 && safeFromHigh <= -15)
    return {
      verdict: "good",
      detail: `Oversold, ${stock.technicals.fromHigh} from 52W high.`,
    };
  if (rsi > 70 && safeFromHigh >= -2)
    return {
      verdict: "bad",
      detail: "Overbought near 52W high. Risky entry.",
    };
  if (rsi >= 40 && rsi <= 60)
    return {
      verdict: "neutral",
      detail: `RSI ${rsi.toFixed(0)}, ${stock.technicals.fromHigh} from 52W high.`,
    };
  return {
    verdict: "neutral",
    detail: `${stock.technicals.fromHigh} from 52W high.`,
  };
}

export function StockScorecard({
  stock,
  fundamentals,
}: {
  stock: Stock;
  fundamentals: YahooFundamentals | null;
}) {
  const perf = derivePerformance(stock);
  const mom = deriveMomentum(stock);
  const val = deriveValuation(stock, fundamentals);
  const entry = deriveEntry(stock);

  return (
    <DashboardCard
      title="Stock scorecard"
      eyebrow="tikrr's read"
    >
      <div className="grid grid-cols-2 gap-2">
        <ScoreBadge title="Performance" verdict={perf.verdict} detail={perf.detail} />
        <ScoreBadge title="Momentum" verdict={mom.verdict} detail={mom.detail} />
        <ScoreBadge title="Valuation" verdict={val.verdict} detail={val.detail} />
        <ScoreBadge title="Entry point" verdict={entry.verdict} detail={entry.detail} />
      </div>
    </DashboardCard>
  );
}

/* ─── KeyMetricsCard ─── */
export function KeyMetricsCard({
  stock,
  fundamentals,
}: {
  stock: Stock;
  fundamentals: YahooFundamentals | null;
}) {
  const rows: Array<{ label: string; value: string; hint?: string }> = [];
  rows.push({
    label: "Market cap",
    value: fundamentals?.marketCap ? formatNumberCompact(fundamentals.marketCap) : "—",
  });
  rows.push({
    label: "TTM PE",
    value:
      fundamentals?.trailingPE && fundamentals.trailingPE > 0
        ? fundamentals.trailingPE.toFixed(1)
        : "—",
  });
  rows.push({
    label: "Fwd PE",
    value:
      fundamentals?.forwardPE && fundamentals.forwardPE > 0
        ? fundamentals.forwardPE.toFixed(1)
        : "—",
  });
  rows.push({
    label: "P/B",
    value:
      fundamentals?.priceToBook && fundamentals.priceToBook > 0
        ? fundamentals.priceToBook.toFixed(2)
        : "—",
  });
  rows.push({
    label: "Div yield",
    value:
      fundamentals?.dividendYield && fundamentals.dividendYield > 0
        ? `${(fundamentals.dividendYield * 100).toFixed(2)}%`
        : "—",
  });
  rows.push({
    label: "EPS (TTM)",
    value:
      fundamentals?.trailingEps !== null && fundamentals?.trailingEps !== undefined
        ? fundamentals.trailingEps.toFixed(2)
        : "—",
  });
  rows.push({
    label: "Volume",
    value: `${(stock.price.volume / 1_000_000).toFixed(1)}M`,
  });
  rows.push({
    label: "52W range",
    value: `${formatCurrency(stock.technicals.fiftyTwoWeekLow, stock.currency)} – ${formatCurrency(stock.technicals.fiftyTwoWeekHigh, stock.currency)}`,
  });

  return (
    <DashboardCard title="Key metrics" eyebrow="Valuation & trade" padding="none">
      <ul className="divide-y divide-[#1F2738]">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-baseline justify-between gap-3 px-5 py-2.5"
          >
            <span className="text-[11px] text-[#8C94A8]">{r.label}</span>
            <span className="font-mono text-[12px] font-medium tabular-nums text-[#F5F6F8]">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

/* ─── AnalystRatingsCard ─── */
export function AnalystRatingsCard({
  stock,
  fundamentals,
}: {
  stock: Stock;
  fundamentals: YahooFundamentals | null;
}) {
  const rating = stock.analystConsensus.rating || fundamentals?.averageAnalystRating || "—";
  const target = stock.analystConsensus.targetPrice;
  const upside = stock.analystConsensus.upside;
  const analystCount =
    stock.analystConsensus.numAnalysts || fundamentals?.numberOfAnalystOpinions || 0;

  if (!target && !rating) return null;

  return (
    <DashboardCard
      title="Analyst ratings"
      eyebrow={analystCount > 0 ? `${analystCount} analyst${analystCount === 1 ? "" : "s"}` : undefined}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-[#1F2738] pb-3">
          <span className="text-[11px] text-[#8C94A8]">Consensus</span>
          <span className="text-[14px] font-semibold text-[#F5F6F8]">{rating}</span>
        </div>
        {target > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-[#8C94A8]">12-mo target</span>
              <span className="font-mono text-[14px] font-medium tabular-nums text-[#F5F6F8]">
                {formatCurrency(target, stock.currency)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] text-[#8C94A8]">Upside</span>
              <span
                className={`font-mono text-[14px] font-semibold tabular-nums ${pctClass(upside)}`}
              >
                {formatPct(upside)}
              </span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-[#1A2130]">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${
                  upside >= 0 ? "bg-[#22C55E]" : "bg-[#EF4444]"
                }`}
                style={{
                  width: `${Math.min(100, Math.max(5, Math.abs(upside)))}%`,
                }}
              />
            </div>
            <p className="text-[10px] text-[#555E75]">
              Current {formatCurrency(stock.price.current, stock.currency)} → target
            </p>
          </>
        )}
      </div>
    </DashboardCard>
  );
}

/* ─── DriversChallengesCards: the paired green/red heroes ─── */
export function DriversChallengesCards({ stock }: { stock: Stock }) {
  const positives = stock.highlights.positive.slice(0, 5);
  const negatives = stock.highlights.negative.slice(0, 5);
  if (positives.length === 0 && negatives.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {positives.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[10px] border border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.04)] p-5">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] bg-[rgba(34,197,94,0.18)] text-[10px] font-bold text-[#22C55E]">
                +
              </span>
              <h3 className="text-[13px] font-semibold text-[#F5F6F8]">
                Growth drivers
              </h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-[#22C55E]">
              What&apos;s working
            </span>
          </header>
          <ul className="flex flex-col gap-2.5">
            {positives.map((item, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-[13px] leading-relaxed text-[#F5F6F8]/85"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#22C55E]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {negatives.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.04)] p-5">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] bg-[rgba(239,68,68,0.18)] text-[10px] font-bold text-[#EF4444]">
                −
              </span>
              <h3 className="text-[13px] font-semibold text-[#F5F6F8]">
                Challenges
              </h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-[#EF4444]">
              What to watch
            </span>
          </header>
          <ul className="flex flex-col gap-2.5">
            {negatives.map((item, i) => (
              <li
                key={i}
                className="flex gap-2.5 text-[13px] leading-relaxed text-[#F5F6F8]/85"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#EF4444]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ─── StockSummaryCard ─── */
export function StockSummaryCard({ stock }: { stock: Stock }) {
  if (!stock.bottomLine) return null;
  const drivers = stock.sentiment.drivers.slice(0, 4);
  const sentTone: "green" | "red" | "neutral" =
    stock.sentiment.trend === "improving"
      ? "green"
      : stock.sentiment.trend === "worsening"
        ? "red"
        : "neutral";

  return (
    <DashboardCard
      title="Stock summary"
      eyebrow="The story right now"
      rightSlot={<ToneChip tone={sentTone}>Sentiment {stock.sentiment.trend}</ToneChip>}
    >
      <p className="max-w-[70ch] text-[14px] leading-relaxed text-[#F5F6F8]/85">
        {stock.bottomLine}
      </p>
      {drivers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {drivers.map((d, i) => (
            <span
              key={i}
              className="rounded-[4px] border border-[#252E42] bg-[#1A2130] px-2 py-1 text-[11px] text-[#8C94A8]"
            >
              {d}
            </span>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

/* ─── SimilarStocksCard ─── */
export function SimilarStocksCard({
  stock,
  peers,
}: {
  stock: Stock;
  peers: Stock[];
}) {
  const filtered = peers
    .filter((p) => p.symbol.toUpperCase() !== stock.symbol.toUpperCase())
    .slice(0, 6);
  if (filtered.length === 0) return null;
  const market = stock.market === "india" ? "india" : "us";

  return (
    <DashboardCard title="Similar stocks" eyebrow={`In ${stock.sector}`} padding="none">
      <ul className="divide-y divide-[#1F2738]">
        {filtered.map((p) => (
          <li key={p.symbol}>
            <Link
              href={`/stock/${encodeURIComponent(p.symbol)}?market=${market}`}
              className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[#1A2130]"
            >
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-semibold text-[#F5F6F8]">
                  {p.symbol}
                </span>
                <p className="mt-0.5 truncate text-[10px] text-[#555E75]">{p.name}</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono text-[12px] font-medium tabular-nums text-[#F5F6F8]">
                  {formatCurrency(p.price.current, p.currency)}
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${pctClass(p.price.changePct)}`}
                >
                  {formatPct(p.price.changePct)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

/* ─── DeltaCardsSection: "what tikrr's tracking" embedded on the stock page ─── */
export function DeltaCardsSection({ cards }: { cards: DeltaCard[] }) {
  if (cards.length === 0) return null;
  return (
    <DashboardCard title="What tikrr's tracking" eyebrow="Signals">
      <ul className="flex flex-col divide-y divide-[#1F2738]">
        {cards.map((card) => {
          const priorityDot =
            card.priority === "high"
              ? "bg-[#EF4444]"
              : card.priority === "medium"
                ? "bg-[#D4AF37]"
                : "bg-[#8C94A8]";
          return (
            <li
              key={card.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot}`}
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-semibold text-[#F5F6F8]">
                  {card.title}
                </h4>
                {card.body && (
                  <p className="mt-1 text-[12px] leading-relaxed text-[#8C94A8]">
                    {card.body}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}

/* ─── NewsCard ─── */
export function NewsCard({ stock }: { stock: Stock }) {
  if (stock.news.length === 0) return null;
  const items = stock.news.slice(0, 8);
  return (
    <DashboardCard title="Recent news" eyebrow="Last 48h">
      <ul className="flex flex-col divide-y divide-[#1F2738]">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 text-[10px] uppercase tracking-[0.12em] text-[#555E75]">
              <span>{item.source}</span>
              <span>·</span>
              <span>{formatNewsTime(item.timestamp)}</span>
              {item.category && (
                <>
                  <span>·</span>
                  <span>{item.category}</span>
                </>
              )}
            </div>
            <p className="text-[13px] font-medium leading-snug text-[#F5F6F8]">
              {item.title}
            </p>
            {item.summary && (
              <p className="text-[12px] leading-relaxed text-[#8C94A8]">
                {item.summary}
              </p>
            )}
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

function formatNewsTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
