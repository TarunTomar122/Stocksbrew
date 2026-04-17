import type { DashboardPayload, Stock } from "@/lib/api-types";
import type { DeltaCard, DeltaCardPriority } from "./delta-cards";

const PRIORITY_ORDER: Record<DeltaCardPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function fsMarketOf(stock: Stock): "US" | "IN" {
  return stock.market === "india" ? "IN" : "US";
}

function stockEntityId(stock: Stock): string {
  return `${fsMarketOf(stock)}_${stock.symbol}`;
}

function stockHref(stock: Stock): string {
  return `/stock/${encodeURIComponent(stock.symbol)}?market=${stock.market ?? "us"}`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.round((ts - Date.now()) / (24 * 60 * 60 * 1000));
}

function signedPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function moveVerb(pct: number): string {
  if (pct > 3) return "surging";
  if (pct > 0.5) return "up";
  if (pct < -3) return "dropping";
  if (pct < -0.5) return "down";
  return "flat";
}

/**
 * Build the ordered list of delta cards from the current dashboard payload.
 *
 * v0 note: this does NOT diff against previous state — there's no memory layer yet.
 * It surfaces the most recent brief + stock state as a priority-sorted feed.
 * v1 will add real delta detection once `stocks/{id}/insights/` is in place.
 */
export function buildDeltaCards(
  payload: DashboardPayload,
  watchlistSymbols: string[],
): DeltaCard[] {
  const cards: DeltaCard[] = [];
  const watchSet = new Set(watchlistSymbols.map((s) => s.toUpperCase()));
  const watchlistStocks = payload.stocks.filter((s) => watchSet.has(s.symbol.toUpperCase()));
  const stockMap = new Map(watchlistStocks.map((s) => [s.symbol.toUpperCase(), s]));
  const brief = payload.portfolioBrief;
  const fallbackTime = payload.view.lastUpdated;

  if (brief?.narrative) {
    cards.push({
      id: "portfolio-narrative",
      entity: { kind: "portfolio", id: "portfolio", label: "Your watchlist" },
      priority: "high",
      kind: "portfolio_narrative",
      title: "Your watchlist, in one paragraph",
      body: brief.narrative,
      generatedAt: fallbackTime,
    });
  }

  if (brief?.blindSpotTitle && brief.blindSpotBody) {
    cards.push({
      id: "portfolio-blind-spot",
      entity: { kind: "portfolio", id: "portfolio", label: "Blind spot" },
      priority: "high",
      kind: "blind_spot",
      title: brief.blindSpotTitle,
      body: brief.blindSpotBody,
      generatedAt: fallbackTime,
    });
  }

  (brief?.signals ?? []).forEach((signal, idx) => {
    const combined = [signal.body, signal.detail].filter(Boolean).join(" ").trim();
    cards.push({
      id: `signal-${idx}-${signal.tag.toLowerCase().replace(/\s+/g, "-")}`,
      entity: { kind: "portfolio", id: "portfolio", label: signal.tag || "Signal" },
      priority: signal.vibe === "negative" ? "high" : "medium",
      kind: "news_sentiment",
      title: signal.headline,
      body: combined,
      generatedAt: fallbackTime,
    });
  });

  (brief?.movers ?? []).forEach((mover) => {
    const stock = stockMap.get(mover.ticker.toUpperCase());
    if (!stock) return;
    const abs = Math.abs(stock.price.changePct);
    const priority: DeltaCardPriority = abs >= 5 ? "high" : abs >= 2 ? "medium" : "low";
    const verb = moveVerb(stock.price.changePct);
    cards.push({
      id: `mover-${stock.symbol}`,
      entity: {
        kind: "stock",
        id: stockEntityId(stock),
        label: stock.symbol,
        market: stock.market as "us" | "india" | undefined,
      },
      priority,
      kind: "price_move",
      title: `${stock.symbol} ${verb} ${signedPct(stock.price.changePct)}`,
      body: mover.oneLiner,
      generatedAt: stock.lastUpdated,
      href: stockHref(stock),
    });
  });

  for (const stock of watchlistStocks) {
    const days = daysUntil(stock.earnings.date);
    if (days === null || days < 0 || days > 7) continue;
    const whenLabel =
      days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    const priority: DeltaCardPriority = days <= 3 ? "high" : "medium";
    const eps = stock.earnings.epsEstimate;
    const body = eps
      ? `Consensus EPS estimate: ${eps}. Expected ${whenLabel}.`
      : `Reports ${whenLabel}.`;
    cards.push({
      id: `earnings-${stock.symbol}`,
      entity: {
        kind: "stock",
        id: stockEntityId(stock),
        label: stock.symbol,
        market: stock.market as "us" | "india" | undefined,
      },
      priority,
      kind: "earnings",
      title: `${stock.symbol} earnings ${whenLabel}`,
      body,
      generatedAt: stock.lastUpdated,
      href: stockHref(stock),
    });
  }

  for (const stock of watchlistStocks) {
    const streak = stock.streak;
    if (!streak?.days || streak.days < 3) continue;
    if (streak.direction === "flat") continue;
    const priority: DeltaCardPriority = streak.days >= 5 ? "high" : "medium";
    cards.push({
      id: `streak-${stock.symbol}`,
      entity: {
        kind: "stock",
        id: stockEntityId(stock),
        label: stock.symbol,
        market: stock.market as "us" | "india" | undefined,
      },
      priority,
      kind: "technical",
      title: `${stock.symbol} on a ${streak.days}-day ${streak.direction} streak`,
      body: `${streak.direction === "up" ? "Gaining" : "Losing"} ground every session. Today: ${signedPct(stock.price.changePct)}.`,
      generatedAt: stock.lastUpdated,
      href: stockHref(stock),
    });
  }

  cards.sort((a, b) => {
    const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (diff !== 0) return diff;
    const ta = Date.parse(a.generatedAt);
    const tb = Date.parse(b.generatedAt);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    return 0;
  });

  return cards;
}

/**
 * Build stock-scoped delta cards for the stock detail page.
 * These are NOT portfolio-level — they're "what tikrr is tracking about this stock".
 */
export function buildStockScopedCards(stock: Stock): DeltaCard[] {
  const cards: DeltaCard[] = [];
  const entity = {
    kind: "stock" as const,
    id: stockEntityId(stock),
    label: stock.symbol,
    market: stock.market as "us" | "india" | undefined,
  };

  const days = daysUntil(stock.earnings.date);
  if (days !== null && days >= 0 && days <= 30) {
    const whenLabel =
      days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    const priority: DeltaCardPriority = days <= 3 ? "high" : days <= 7 ? "medium" : "low";
    cards.push({
      id: `stock-earnings-${stock.symbol}`,
      entity,
      priority,
      kind: "earnings",
      title: `Earnings ${whenLabel}`,
      body: stock.earnings.epsEstimate
        ? `Consensus EPS estimate: ${stock.earnings.epsEstimate}.`
        : `Next earnings report expected ${whenLabel}.`,
      generatedAt: stock.lastUpdated,
    });
  }

  const streak = stock.streak;
  if (streak?.days && streak.days >= 3 && streak.direction !== "flat") {
    cards.push({
      id: `stock-streak-${stock.symbol}`,
      entity,
      priority: streak.days >= 5 ? "high" : "medium",
      kind: "technical",
      title: `${streak.days}-day ${streak.direction} streak`,
      body: `${streak.direction === "up" ? "Green" : "Red"} every session for ${streak.days} days. Today: ${signedPct(stock.price.changePct)}.`,
      generatedAt: stock.lastUpdated,
    });
  }

  if (Math.abs(stock.price.changePct) >= 3) {
    cards.push({
      id: `stock-move-${stock.symbol}`,
      entity,
      priority: Math.abs(stock.price.changePct) >= 5 ? "high" : "medium",
      kind: "price_move",
      title: `${moveVerb(stock.price.changePct)[0].toUpperCase() + moveVerb(stock.price.changePct).slice(1)} ${signedPct(stock.price.changePct)} today`,
      body: stock.sentiment.drivers[0] || "No clear news driver identified. Positioning shift.",
      generatedAt: stock.lastUpdated,
    });
  }

  const rsi = stock.technicals.rsi14;
  if (rsi > 70) {
    cards.push({
      id: `stock-rsi-overbought-${stock.symbol}`,
      entity,
      priority: "low",
      kind: "technical",
      title: `RSI overbought (${rsi.toFixed(1)})`,
      body: `14-day RSI is above 70. Technically stretched — watch for a mean-reversion move.`,
      generatedAt: stock.lastUpdated,
    });
  } else if (rsi > 0 && rsi < 30) {
    cards.push({
      id: `stock-rsi-oversold-${stock.symbol}`,
      entity,
      priority: "low",
      kind: "technical",
      title: `RSI oversold (${rsi.toFixed(1)})`,
      body: `14-day RSI is below 30. Technically beaten down — watch for a bounce.`,
      generatedAt: stock.lastUpdated,
    });
  }

  (stock.catalysts ?? []).slice(0, 3).forEach((catalyst, idx) => {
    cards.push({
      id: `stock-catalyst-${stock.symbol}-${idx}`,
      entity,
      priority: idx === 0 ? "high" : "medium",
      kind: "catalyst_shift",
      title: catalyst.length > 90 ? `${catalyst.slice(0, 87)}…` : catalyst,
      body: "",
      generatedAt: stock.lastUpdated,
    });
  });

  cards.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return cards;
}
