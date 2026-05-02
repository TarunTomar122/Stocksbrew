import type { StockFacts, StockFundamentals, StockIntelPro } from "@/lib/stock";
import type { StockTechnicals } from "@/lib/technicals";
import type { Market } from "@/lib/types";

type Signal = {
  emoji: string;
  bg: string;
  label: string;
  headline: string;
  supporting?: string;
  tone?: "up" | "down" | "warn" | "ink";
  importance: number;
};

type Props = {
  facts: StockFacts | null;
  intelPro: StockIntelPro | null;
  technicals: StockTechnicals | null;
  fundamentals: StockFundamentals | null;
  currentPrice?: number;
  market: Market;
};

// Surface the top "why care?" reasons for this stock right now. Pulls from
// every free-tier data source we already have (facts, intel pro, technicals,
// Yahoo fundamentals). Each generator returns null when the underlying number
// isn't useful — only the most actionable signals make it into the deck.
export function SignalDeck({
  facts,
  intelPro,
  technicals,
  fundamentals,
  currentPrice,
  market,
}: Props) {
  const signals = collectSignals({
    facts,
    intelPro,
    technicals,
    fundamentals,
    currentPrice,
    market,
  });
  if (signals.length === 0) return null;

  const top = [...signals].sort((a, b) => b.importance - a.importance).slice(0, 5);
  // Tailwind needs literal class names, so map count → class explicitly.
  const cols =
    top.length >= 5
      ? "lg:grid-cols-5"
      : top.length === 4
        ? "lg:grid-cols-4"
        : top.length === 3
          ? "lg:grid-cols-3"
          : top.length === 2
            ? "lg:grid-cols-2"
            : "lg:grid-cols-1";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
          Why care today
        </h3>
        <span className="text-[12px] text-[#6b7280]">
          {top.length} signal{top.length === 1 ? "" : "s"} from free data
        </span>
      </div>
      <div className={`grid grid-cols-2 md:grid-cols-3 ${cols} gap-3`}>
        {top.map((s, i) => (
          <SignalTile key={`${s.label}-${i}`} signal={s} />
        ))}
      </div>
    </section>
  );
}

function SignalTile({ signal }: { signal: Signal }) {
  const headlineClass =
    signal.tone === "up"
      ? "text-[#10b981]"
      : signal.tone === "down"
        ? "text-[#ef4444]"
        : signal.tone === "warn"
          ? "text-[#b45309]"
          : "text-[#111111]";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]"
        style={{ background: signal.bg }}
      >
        {signal.emoji}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af]">
          {signal.label}
        </span>
        <span className={`text-[18px] font-semibold tabular-nums leading-tight ${headlineClass}`}>
          {signal.headline}
        </span>
        {signal.supporting && (
          <span className="text-[12px] text-[#6b7280] leading-snug">
            {signal.supporting}
          </span>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Signal generators
// -----------------------------------------------------------------------------

function collectSignals({
  facts,
  intelPro,
  technicals,
  fundamentals,
  currentPrice,
  market,
}: Props): Signal[] {
  const out: Signal[] = [];

  // 1. Analyst upside (US-friendly; India where Tickertape/Yahoo provides target)
  const target = facts?.analyst?.target_price;
  const analystCount = facts?.analyst?.analyst_count ?? 0;
  if (
    typeof currentPrice === "number" &&
    typeof target === "number" &&
    currentPrice > 0
  ) {
    const upside = ((target - currentPrice) / currentPrice) * 100;
    if (Math.abs(upside) >= 5) {
      out.push({
        emoji: "🎯",
        bg: "#eff6ff",
        label: "Analyst target",
        headline: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`,
        supporting:
          analystCount > 0
            ? `Target ${formatMoney(target, market)} · ${analystCount} analysts`
            : `Target ${formatMoney(target, market)}`,
        tone: upside >= 0 ? "up" : "down",
        importance: 60 + Math.min(30, Math.abs(upside)),
      });
    }
  }

  // 2. 52W extreme (closer than ±5% to high or low gets top billing)
  const fromHigh = technicals?.distance?.from_52w_high_pct;
  const fromLow = technicals?.distance?.from_52w_low_pct;
  if (typeof fromHigh === "number" && fromHigh >= -8) {
    out.push({
      emoji: "🚀",
      bg: "#ecfdf5",
      label: "52W high",
      headline: fromHigh >= -1 ? "At 52W high" : `${fromHigh.toFixed(1)}%`,
      supporting:
        fromHigh >= -3
          ? "Riding the top of the range"
          : `Off the high — momentum still hot`,
      tone: "up",
      importance: 95 - Math.min(40, Math.abs(fromHigh) * 4),
    });
  } else if (typeof fromLow === "number" && fromLow <= 10) {
    out.push({
      emoji: "🩸",
      bg: "#fef2f2",
      label: "52W low",
      headline: fromLow <= 1 ? "At 52W low" : `+${fromLow.toFixed(1)}%`,
      supporting: fromLow <= 5
        ? "Washed-out — watch for capitulation"
        : "Just off the low — cap-bottom watch",
      tone: "down",
      importance: 90 - Math.min(40, fromLow * 3),
    });
  }

  // 3. Strongest return window (pick the most decisive move)
  const returns = facts?.returns ?? {};
  type Ret = { label: string; v: number };
  const ret: Ret[] = [
    { label: "1M", v: pickPct(returns.one_month_pct) },
    { label: "3M", v: pickPct(returns.three_month_pct) },
    { label: "6M", v: pickPct(returns.six_month_pct) },
    { label: "1Y", v: pickPct(returns.one_year_pct) },
  ].filter((x) => Number.isFinite(x.v) && x.v !== 0) as Ret[];
  if (ret.length > 0) {
    const winner = ret.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
    if (Math.abs(winner.v) >= 8) {
      const supportingPieces = ret
        .filter((x) => x.label !== winner.label)
        .map((x) => `${x.label} ${x.v >= 0 ? "+" : ""}${x.v.toFixed(1)}%`);
      out.push({
        emoji: winner.v >= 0 ? "📈" : "📉",
        bg: winner.v >= 0 ? "#ecfdf5" : "#fef2f2",
        label: `Past ${winner.label}`,
        headline: `${winner.v >= 0 ? "+" : ""}${winner.v.toFixed(1)}%`,
        supporting: supportingPieces.slice(0, 2).join(" · "),
        tone: winner.v >= 0 ? "up" : "down",
        importance: 55 + Math.min(30, Math.abs(winner.v) * 0.8),
      });
    }
  }

  // 4. RSI extreme (US has reliable RSI; skip non-actionable neutral state)
  const rsi = technicals?.rsi_14;
  if (typeof rsi?.value === "number") {
    if (rsi.state === "overbought" || rsi.value >= 70) {
      out.push({
        emoji: "🔥",
        bg: "#fef3c7",
        label: "RSI stretched",
        headline: `${Math.round(rsi.value)}`,
        supporting: "Overbought — pullback risk",
        tone: "warn",
        importance: 78 + Math.min(10, rsi.value - 70),
      });
    } else if (rsi.state === "oversold" || rsi.value <= 30) {
      out.push({
        emoji: "💧",
        bg: "#eff6ff",
        label: "RSI washed",
        headline: `${Math.round(rsi.value)}`,
        supporting: "Oversold — bounce setup",
        tone: "warn",
        importance: 78 + Math.min(10, 30 - rsi.value),
      });
    }
  }

  // 5. Pillar standout (strongest or weakest, whichever is more extreme)
  const pillars = intelPro?.pillars;
  if (pillars) {
    const entries = (
      ["growth", "momentum", "valuation", "quality"] as const
    ).map((key) => ({ key, score: pillars[key]?.score ?? null }));
    const valid = entries.filter(
      (e): e is { key: typeof e.key; score: number } => typeof e.score === "number",
    );
    if (valid.length > 0) {
      const best = valid.reduce((a, b) => (b.score > a.score ? b : a));
      const worst = valid.reduce((a, b) => (b.score < a.score ? b : a));
      const bestGap = best.score - 50;
      const worstGap = 50 - worst.score;
      if (bestGap >= worstGap && best.score >= 70) {
        out.push({
          emoji: PILLAR_EMOJI[best.key],
          bg: PILLAR_BG[best.key],
          label: `Strong ${best.key}`,
          headline: `${Math.round(best.score)}`,
          supporting: `Top pillar on the scorecard`,
          tone: "up",
          importance: 50 + bestGap * 0.6,
        });
      } else if (worst.score <= 35) {
        out.push({
          emoji: PILLAR_EMOJI[worst.key],
          bg: PILLAR_BG[worst.key],
          label: `Weak ${worst.key}`,
          headline: `${Math.round(worst.score)}`,
          supporting: `Trailing the rest of the scorecard`,
          tone: "down",
          importance: 48 + worstGap * 0.6,
        });
      }
    }
  }

  // 6. Revenue growth snapshot
  const revGrowth = facts?.financials?.revenue_growth_yoy_pct;
  if (typeof revGrowth === "number" && Math.abs(revGrowth) >= 8) {
    out.push({
      emoji: "💰",
      bg: "#ecfdf5",
      label: "Revenue YoY",
      headline: `${revGrowth >= 0 ? "+" : ""}${revGrowth.toFixed(1)}%`,
      supporting:
        revGrowth >= 25
          ? "High-growth top line"
          : revGrowth >= 15
            ? "Solid growth tape"
            : revGrowth >= 0
              ? "Steady but slowing"
              : "Top line going backwards",
      tone: revGrowth >= 0 ? "up" : "down",
      importance: 50 + Math.min(20, Math.abs(revGrowth) * 0.4),
    });
  }

  // 7. Ownership — language differs US vs India
  const instPct =
    facts?.institutions?.ownership_pct ??
    facts?.quick_stats?.institutional_ownership_pct ??
    null;
  if (typeof instPct === "number" && instPct >= 30) {
    out.push({
      emoji: market === "IN" ? "🏦" : "🏛️",
      bg: "#f3f4f6",
      label: market === "IN" ? "FII + DII" : "Institutional",
      headline: `${instPct.toFixed(1)}%`,
      supporting:
        market === "IN"
          ? "Smart-money footprint"
          : "Footprint of total float",
      tone: "ink",
      importance: 40 + Math.min(20, (instPct - 30) * 0.4),
    });
  }

  // 8. Earnings event hint — bumps to top when imminent
  const event = facts?.events?.[0];
  if (event?.date_label) {
    out.push({
      emoji: "📅",
      bg: "#fef3c7",
      label: `Next ${event.title?.toLowerCase() ?? "event"}`,
      headline: event.date_label,
      supporting: "Catalyst window — watch for guide",
      tone: "warn",
      importance: 88,
    });
  }

  // 9. Beta (only when notably high or low)
  const beta = fundamentals?.beta;
  if (typeof beta === "number" && (beta >= 1.5 || beta <= 0.6)) {
    out.push({
      emoji: beta >= 1.5 ? "⚡" : "🛡️",
      bg: "#eff6ff",
      label: "Beta",
      headline: beta.toFixed(2),
      supporting:
        beta >= 1.5
          ? "Higher swing than the index"
          : "Lower swing than the index",
      tone: "ink",
      importance: 38,
    });
  }

  return out;
}

const PILLAR_EMOJI: Record<"growth" | "momentum" | "valuation" | "quality", string> = {
  growth: "🌱",
  momentum: "🚀",
  valuation: "🏷️",
  quality: "🏛️",
};
const PILLAR_BG: Record<"growth" | "momentum" | "valuation" | "quality", string> = {
  growth: "#ecfdf5",
  momentum: "#eff6ff",
  valuation: "#fef3c7",
  quality: "#f3f4f6",
};

function pickPct(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

function formatMoney(value: number, market: Market): string {
  const symbol = market === "IN" ? "₹" : "$";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}
