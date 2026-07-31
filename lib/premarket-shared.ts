export type PremarketQuoteValue = {
  pre_market_change_pct: number;
  pre_market_price: number;
  previous_close?: number;
};

export type PremarketSnapshotLike = {
  market: "US" | "IN";
  generated_at: string;
  date: string;
  market_state: string;
  by_ticker: Record<string, PremarketQuoteValue>;
};

export type LivePremarketQuote = {
  price: number;
  changePct: number;
  generatedAt: string;
};

type MarketClockParts = {
  weekday: string;
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function marketClockParts(
  market: "US" | "IN",
  ref = new Date(),
): MarketClockParts {
  const parts: Partial<MarketClockParts> = {};
  const timeZone = market === "IN" ? "Asia/Kolkata" : "America/New_York";

  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(ref)) {
    if (part.type === "weekday") parts.weekday = part.value;
    if (part.type === "year") parts.year = part.value;
    if (part.type === "month") parts.month = part.value;
    if (part.type === "day") parts.day = part.value;
    if (part.type === "hour") parts.hour = part.value;
    if (part.type === "minute") parts.minute = part.value;
    if (part.type === "second") parts.second = part.value;
  }

  return parts as MarketClockParts;
}

export function marketDateIso(
  market: "US" | "IN",
  ref = new Date(),
): string {
  const parts = marketClockParts(market, ref);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** US regular-session pre-market: Mon-Fri, 4:00-9:30 ET. */
export function isUsPremarketWindow(ref = new Date()): boolean {
  const parts = marketClockParts("US", ref);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 4 * 60 && minutes < 9 * 60 + 30;
}

/** Milliseconds until the US opening bell for a time already in pre-market. */
export function millisecondsUntilUsMarketOpen(ref = new Date()): number {
  if (!isUsPremarketWindow(ref)) return 0;
  const parts = marketClockParts("US", ref);
  const currentSeconds =
    Number(parts.hour) * 60 * 60 +
    Number(parts.minute) * 60 +
    Number(parts.second);
  const openSeconds = 9 * 60 * 60 + 30 * 60;
  return Math.max(0, (openSeconds - currentSeconds) * 1_000);
}

/** True only while the snapshot belongs to today's active pre-market session. */
export function isPremarketLive(
  doc: PremarketSnapshotLike | null,
  market: "US" | "IN" = "US",
  ref = new Date(),
): boolean {
  if (!doc || doc.market !== market) return false;
  if (market === "US" && !isUsPremarketWindow(ref)) return false;

  const docDate = String(doc.date || "").slice(0, 10);
  if (docDate !== marketDateIso(market, ref)) return false;

  return String(doc.market_state || "").toUpperCase().startsWith("PRE");
}

export function getLivePremarketQuote(
  doc: PremarketSnapshotLike | null,
  ticker: string,
  market: "US" | "IN" = "US",
  ref = new Date(),
): LivePremarketQuote | null {
  if (!isPremarketLive(doc, market, ref)) return null;

  const normalizedTicker = ticker.trim().toUpperCase();
  const quote = doc?.by_ticker?.[normalizedTicker];
  if (
    !quote ||
    !Number.isFinite(quote.pre_market_price) ||
    quote.pre_market_price <= 0 ||
    !Number.isFinite(quote.pre_market_change_pct)
  ) {
    return null;
  }

  return {
    price: quote.pre_market_price,
    changePct: quote.pre_market_change_pct,
    generatedAt: doc.generated_at,
  };
}
