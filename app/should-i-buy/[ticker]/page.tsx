import type { Metadata } from "next";
import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { ShouldIBuyShare } from "@/components/should-i-buy-share";
import {
  getStockSummary,
  getStockIntelPro,
  normalizeStockSymbolParam,
} from "@/lib/stock";
import { getLatestTechnicals } from "@/lib/technicals";
import type { StockIntelPro } from "@/lib/types";

export const revalidate = 120;

type Props = {
  params: Promise<{ ticker: string }>;
};

// ---------------------------------------------------------------------------
// Verdict computation
// ---------------------------------------------------------------------------

type VerdictLevel =
  | "Strong buy signal"
  | "Buy signal"
  | "Hold / watch"
  | "Cautious"
  | "Avoid for now";

type Verdict = {
  level: VerdictLevel;
  headline: string;
  color: string;
  bg: string;
  textColor: string;
  reasons: string[];
};

function countWeakPillars(intel: StockIntelPro): number {
  const { valuation, growth, quality, momentum } = intel.pillars;
  return [valuation, growth, quality, momentum].filter(
    (p) => p.verdict === "weak",
  ).length;
}


function buildReasons(intel: StockIntelPro, rsi?: number | null): string[] {
  const { valuation, growth, quality, momentum } = intel.pillars;
  const lines: Array<{ text: string; priority: number }> = [];

  // Momentum
  if (momentum.score >= 65 && (momentum.verdict === "solid" || momentum.verdict === "strong")) {
    lines.push({ text: "Price trend is strong and momentum is building", priority: 1 });
  } else if (momentum.score < 45) {
    lines.push({ text: "Price trend is weak - momentum has stalled", priority: 1 });
  } else {
    lines.push({ text: "Momentum is mixed with no clear directional trend", priority: 3 });
  }

  // Valuation
  if (valuation.score >= 60) {
    lines.push({ text: "Stock appears reasonably priced relative to its fundamentals", priority: 2 });
  } else if (valuation.score < 30) {
    lines.push({ text: "Stock is priced for perfection - leaves little room for error", priority: 1 });
  } else {
    lines.push({ text: "Valuation is in the middle - neither cheap nor expensive", priority: 3 });
  }

  // Growth
  if (growth.score >= 60) {
    lines.push({ text: "Revenue and earnings trajectory looks solid", priority: 2 });
  } else if (growth.score < 35) {
    lines.push({ text: "Growth outlook is under pressure", priority: 1 });
  } else {
    lines.push({ text: "Growth is modest but not alarming", priority: 3 });
  }

  // Quality
  if (quality.score >= 60) {
    lines.push({ text: "Balance sheet is healthy with strong financial quality", priority: 2 });
  } else if (quality.score < 40) {
    lines.push({ text: "Some concerns around balance sheet and financial quality", priority: 1 });
  } else {
    lines.push({ text: "Financial quality is adequate", priority: 3 });
  }

  // RSI - only extreme readings earn a reason slot
  if (typeof rsi === "number") {
    if (rsi >= 72) {
      lines.push({ text: "Technically overbought - a short-term pullback is possible", priority: 1 });
    } else if (rsi <= 32) {
      lines.push({ text: "Technically oversold - a bounce could be near", priority: 1 });
    }
  }

  lines.sort((a, b) => a.priority - b.priority);
  return lines.slice(0, 3).map((l) => l.text);
}

function computeVerdict(intel: StockIntelPro, rsi?: number | null): Verdict {
  const score = intel.overall.score;
  const momentumVerdict = intel.pillars.momentum.verdict;
  const weakCount = countWeakPillars(intel);
  const isOverbought = typeof rsi === "number" && rsi >= 72;

  let level: VerdictLevel;

  if (
    score >= 72 &&
    (momentumVerdict === "solid" || momentumVerdict === "strong") &&
    !isOverbought
  ) {
    level = "Strong buy signal";
  } else if (score >= 60 && weakCount <= 1) {
    level = "Buy signal";
  } else if (
    (score >= 45 && score < 60) ||
    (score >= 60 && isOverbought)
  ) {
    level = "Hold / watch";
  } else if (score >= 30 || weakCount === 2) {
    level = "Cautious";
  } else {
    level = "Avoid for now";
  }

  const headlines: Record<VerdictLevel, string> = {
    "Strong buy signal":
      "The data lines up -- fundamentals, momentum, and price all point in the same direction.",
    "Buy signal":
      "More reasons to be in than out -- the overall picture favours a position.",
    "Hold / watch":
      "Decent fundamentals but not the cleanest entry point right now.",
    "Cautious":
      "The data is mixed enough that waiting for a better setup makes sense.",
    "Avoid for now":
      "Too many signals are flashing red -- the risk/reward does not look attractive.",
  };

  const buyBg = "#ecfdf5";
  const buyText = "#065f46";
  const holdBg = "#fef3c7";
  const holdText = "#92400e";
  const avoidBg = "#fef2f2";
  const avoidText = "#991b1b";

  const colors: Record<
    VerdictLevel,
    { color: string; bg: string; textColor: string }
  > = {
    "Strong buy signal": { color: "#10b981", bg: buyBg, textColor: buyText },
    "Buy signal": { color: "#10b981", bg: buyBg, textColor: buyText },
    "Hold / watch": { color: "#f59e0b", bg: holdBg, textColor: holdText },
    "Cautious": { color: "#f59e0b", bg: avoidBg, textColor: avoidText },
    "Avoid for now": { color: "#ef4444", bg: avoidBg, textColor: avoidText },
  };

  const reasons = buildReasons(intel, rsi);

  return {
    level,
    headline: headlines[level],
    ...colors[level],
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const normalized = normalizeStockSymbolParam(ticker);
  const upper = normalized ?? ticker.trim().toUpperCase().slice(0, 16);

  // Attempt to get score for richer description
  let description = `Get a data-driven buy, hold, or avoid signal for ${upper} based on valuation, growth, quality, and momentum scores.`;
  let verdictHeadline = "";

  try {
    const [stock, intel] = await Promise.all([
      getStockSummary(upper, "US"),
      getStockIntelPro(`US_${upper}`, "US").catch(() => null),
    ]);
    if (intel) {
      const rsiData = await getLatestTechnicals(`US_${upper}`).catch(() => null);
      const rsi = rsiData?.rsi_14?.value ?? null;
      const verdict = computeVerdict(intel, rsi);
      verdictHeadline = verdict.level;
      description = `${upper} scores ${intel.overall.score}/100 overall. ${verdict.level}. See the full breakdown.`;
      void stock; // already used instrument_id above
    }
  } catch {
    // fallback description is fine
  }

  return {
    title: `Should I Buy ${upper}? | stocksbrew`,
    description,
    openGraph: {
      title: `Should I Buy ${upper}? | stocksbrew`,
      description,
      url: `https://www.stocksbrew.online/should-i-buy/${upper}`,
    },
    twitter: {
      title: `Should I Buy ${upper}? | stocksbrew`,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// Pillar verdict badge
// ---------------------------------------------------------------------------

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    strong: { bg: "#ecfdf5", text: "#065f46", label: "Strong" },
    solid: { bg: "#d1fae5", text: "#065f46", label: "Solid" },
    mixed: { bg: "#fef3c7", text: "#92400e", label: "Mixed" },
    weak: { bg: "#fef2f2", text: "#991b1b", label: "Weak" },
  };
  const s = map[verdict] ?? map["mixed"];
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ShouldIBuyTickerPage({ params }: Props) {
  const { ticker } = await params;
  const normalized = normalizeStockSymbolParam(ticker);

  if (!normalized) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16">
          <NoCoverageCard ticker={ticker.toUpperCase().slice(0, 16)} />
        </div>
      </main>
    );
  }

  const upper = normalized;

  // Try US market first (this tool targets US stocks)
  const stock = await getStockSummary(upper, "US").catch(() => null);

  if (!stock) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16">
          <NoCoverageCard ticker={upper} />
        </div>
      </main>
    );
  }

  const [intel, technicals] = await Promise.all([
    getStockIntelPro(stock.instrument_id, "US").catch(() => null),
    getLatestTechnicals(stock.instrument_id).catch(() => null),
  ]);

  // Price-only state
  if (!intel) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16">
          <PriceOnlyCard stock={stock} />
        </div>
      </main>
    );
  }

  const rsi = technicals?.rsi_14?.value ?? null;
  const verdict = computeVerdict(intel, rsi);
  const { valuation, growth, quality, momentum } = intel.pillars;

  const priceChange = stock.day_change_pct;
  const priceChangeStr =
    typeof priceChange === "number"
      ? `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%`
      : null;
  const priceStr = `$${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const pillars = [
    { label: "Valuation", pillar: valuation },
    { label: "Growth",    pillar: growth },
    { label: "Quality",   pillar: quality },
    { label: "Momentum",  pillar: momentum },
  ] as const;

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-10 md:py-14">

        {/* Breadcrumb */}
        <nav className="mb-8 flex items-center gap-2 text-[13px] text-[#9ca3af]">
          <Link href="/should-i-buy" className="hover:text-[#6b7280] transition-colors">
            Should I buy?
          </Link>
          <span>/</span>
          <span className="text-[#374151] font-medium">{upper}</span>
        </nav>

        {/* ── TWO-COLUMN LAYOUT ── */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">

          {/* ── LEFT: TINDER CARD ── fixed width, portrait */}
          <div className="w-full lg:w-[400px] shrink-0 flex flex-col gap-4">

            {/* THE CARD */}
            <div id="should-i-buy-card" className="rounded-[28px] overflow-hidden shadow-[0_16px_56px_rgba(0,0,0,0.12)]">

              {/* Colored top */}
              <div
                className="px-8 pt-9 pb-8 flex flex-col items-center gap-5 text-center"
                style={{ background: verdict.bg }}
              >
                <div className="flex items-center gap-3 text-left">
                  <StockLogo ticker={upper} logoUrl={stock.logo_url} size={48} market="US" />
                  <div className="flex flex-col gap-1">
                    <h1
                      className="text-[15px] font-bold tracking-[-0.015em] leading-tight"
                      style={{ color: verdict.textColor }}
                    >
                      {stock.name}
                    </h1>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold" style={{ color: verdict.textColor, opacity: 0.55 }}>
                        {upper}
                      </span>
                      <span className="h-3 w-px" style={{ background: verdict.textColor, opacity: 0.2 }} aria-hidden />
                      <span className="text-[13px] font-bold tabular-nums" style={{ color: verdict.textColor }}>
                        {priceStr}
                      </span>
                      {priceChangeStr && (
                        <span
                          className="text-[12px] font-semibold tabular-nums"
                          style={{ color: (priceChange ?? 0) >= 0 ? "#059669" : "#dc2626" }}
                        >
                          {priceChangeStr}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-full h-px" style={{ background: verdict.color, opacity: 0.2 }} aria-hidden />

                <div className="flex flex-col items-center gap-2">
                  <h2
                    className="text-[28px] md:text-[32px] font-bold tracking-[-0.03em] leading-[1.1]"
                    style={{ color: verdict.textColor }}
                  >
                    {verdict.level}
                  </h2>
                  <div data-score-pill className="flex items-center gap-1 rounded-full px-3.5 py-1.5" style={{ background: verdict.color + "22" }}>
                    <span className="text-[20px] font-bold leading-none tracking-[-0.03em]" style={{ color: verdict.textColor }}>
                      {intel.overall.score}
                    </span>
                    <span className="text-[12px] font-medium" style={{ color: verdict.textColor, opacity: 0.55 }}>
                      / 100
                    </span>
                  </div>
                </div>
              </div>

              {/* White bottom: reasons + action buttons */}
              <div className="bg-white px-6 pt-6 pb-5 flex flex-col gap-5">
                {/* Tinder action row */}
                <div data-screenshot-exclude className="flex items-center justify-center gap-10 pt-1 pb-1">
                  <Link href="/should-i-buy" className="group flex flex-col items-center gap-1.5" title="Try another">
                    <div className="w-[52px] h-[52px] rounded-full border-2 border-[#e5e7eb] bg-white flex items-center justify-center shadow-sm group-hover:border-[#ef4444] group-hover:shadow-md transition-all">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="#d1d5db" strokeWidth="2.2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-semibold text-[#9ca3af] group-hover:text-[#ef4444] transition-colors">
                      Try another
                    </span>
                  </Link>

                  <Link href={`/stock/${upper}`} className="group flex flex-col items-center gap-1.5" title={`Full ${upper} page`}>
                    <div
                      className="w-[64px] h-[64px] rounded-full flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all"
                      style={{ background: verdict.color }}
                    >
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
                        <path d="M13 22.5C13 22.5 3.5 17 3.5 10C3.5 7.1 5.85 4.8 8.75 4.8C10.4 4.8 11.9 5.65 12.85 6.95C12.95 7.08 13.05 7.08 13.15 6.95C14.1 5.65 15.6 4.8 17.25 4.8C20.15 4.8 22.5 7.1 22.5 10C22.5 17 13 22.5 13 22.5Z" fill="white" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-semibold transition-colors" style={{ color: verdict.color }}>
                      Deep dive
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: BREAKDOWN + SHARE + CTA ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">

            {/* Four-pillar grid */}
            <div>
              <h2 className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em] mb-4">
                Four-pillar breakdown
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {pillars.map(({ label, pillar }) => (
                  <div
                    key={label}
                    className="rounded-[16px] border border-[#e5e7eb] bg-white p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-[#6b7280]">{label}</span>
                      <VerdictBadge verdict={pillar.verdict} />
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="text-[32px] font-bold tracking-[-0.03em] text-[#111111] leading-none">
                        {pillar.score}
                      </span>
                      <span className="text-[13px] text-[#9ca3af] mb-0.5">/100</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#f3f4f6] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pillar.score}%`,
                          background: pillar.score >= 60 ? "#10b981" : pillar.score >= 40 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RSI - only when extreme */}
            {typeof rsi === "number" && (rsi >= 70 || rsi <= 30) && (
              <div
                className="rounded-[16px] px-5 py-4 flex items-center justify-between gap-4"
                style={{ background: rsi >= 70 ? "#fef2f2" : "#ecfdf5", border: `1px solid ${rsi >= 70 ? "#fecaca" : "#a7f3d0"}` }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold tracking-[0.06em] uppercase" style={{ color: rsi >= 70 ? "#991b1b" : "#065f46", opacity: 0.6 }}>
                    Technical RSI-14
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[24px] font-bold tabular-nums" style={{ color: rsi >= 70 ? "#991b1b" : "#065f46" }}>
                      {rsi.toFixed(1)}
                    </span>
                    <span
                      className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
                      style={{ background: rsi >= 70 ? "#fecaca" : "#a7f3d0", color: rsi >= 70 ? "#991b1b" : "#065f46" }}
                    >
                      {rsi >= 70 ? "Overbought" : "Oversold"}
                    </span>
                  </div>
                </div>
                <p className="text-[12px] leading-[1.5] text-right max-w-[180px]" style={{ color: rsi >= 70 ? "#991b1b" : "#065f46", opacity: 0.75 }}>
                  {rsi >= 70
                    ? "Short-term pullback risk before next leg up."
                    : "Potential bounce zone if fundamentals support it."}
                </p>
              </div>
            )}

            {/* Share */}
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[#9ca3af] tracking-[0.08em] uppercase">
                Share this signal
              </p>
              <ShouldIBuyShare ticker={upper} />
            </div>

            {/* CTA */}
            <div className="rounded-[20px] bg-[#0052ff] p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-[16px] font-bold text-white tracking-[-0.01em]">
                  Want this for your whole watchlist?
                </h2>
                <p className="text-[13px] text-white/75 leading-[1.5]">
                  Daily signals and AI briefs for every stock in your Radar.
                </p>
              </div>
              <Link
                href="/"
                className="shrink-0 rounded-[10px] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#0052ff] hover:bg-white/90 transition-colors"
              >
                Explore stocksbrew →
              </Link>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-[#9ca3af] leading-[1.6]">
              Not investment advice. Data-driven signals only - always do your own research.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function NoCoverageCard({ ticker }: { ticker: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f3f4f6]">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
          <circle cx="14" cy="14" r="12" stroke="#9ca3af" strokeWidth="1.5" />
          <path d="M14 9v5M14 18h.01" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[24px] font-bold tracking-[-0.02em] text-[#111111]">
          We don't have {ticker} yet
        </h1>
        <p className="text-[15px] text-[#6b7280] max-w-[440px] leading-[1.55]">
          This ticker isn't in our coverage universe yet. You can request it and
          we'll add it to the queue.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={`/stock/${ticker}`}
          className="rounded-[12px] bg-[#0052ff] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#0041cc] transition-colors"
        >
          Request this stock
        </Link>
        <Link
          href="/should-i-buy"
          className="rounded-[12px] border border-[#e5e7eb] bg-white px-5 py-2.5 text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
        >
          Try another ticker
        </Link>
      </div>
    </div>
  );
}

function PriceOnlyCard({
  stock,
}: {
  stock: {
    ticker: string;
    name: string;
    price: number;
    day_change_pct?: number;
    logo_url?: string;
    sector?: string;
  };
}) {
  const priceChange = stock.day_change_pct;
  const priceChangeStr =
    typeof priceChange === "number"
      ? `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%`
      : null;

  return (
    <div className="flex flex-col gap-8">
      <nav className="flex items-center gap-2 text-[13px] text-[#9ca3af]">
        <Link href="/should-i-buy" className="hover:text-[#6b7280] transition-colors">
          Should I buy?
        </Link>
        <span>/</span>
        <span className="text-[#374151] font-medium">{stock.ticker}</span>
      </nav>

      <div className="flex items-center gap-4">
        <StockLogo ticker={stock.ticker} logoUrl={stock.logo_url} size={48} market="US" />
        <div>
          <h1 className="text-[20px] font-bold text-[#111111]">{stock.name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-[#111111]">
              ${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {priceChangeStr && (
              <span
                className="text-[13px] font-medium"
                style={{ color: (priceChange ?? 0) >= 0 ? "#10b981" : "#ef4444" }}
              >
                {priceChangeStr}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" aria-hidden />
          <h2 className="text-[16px] font-semibold text-[#111111]">
            Limited analysis available
          </h2>
        </div>
        <p className="text-[14px] text-[#6b7280] leading-[1.55]">
          We have price data for {stock.ticker} but our full scoring model (valuation,
          growth, quality, momentum) is still being built for this stock. Check
          back soon or explore the full stock page for more detail.
        </p>
        <Link
          href={`/stock/${stock.ticker}`}
          className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#0052ff] hover:underline"
        >
          View full stock page
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 7h8M8 4l3 3-3 3" stroke="#0052ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <Link
        href="/should-i-buy"
        className="text-[14px] text-[#6b7280] hover:text-[#374151] transition-colors"
      >
        Try another ticker
      </Link>
    </div>
  );
}
