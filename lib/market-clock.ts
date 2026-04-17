/**
 * Market clock utility — DST-aware market hours for US and India.
 *
 * All logic works in UTC internally and converts to local market time
 * only for display. This avoids timezone library dependencies.
 */

export type MarketId = "US" | "IN";

export type MarketState = "open" | "closed" | "pre_market" | "post_market";

export type MarketStatus = {
  market: MarketId;
  state: MarketState;
  /** Human label: "Open", "Closed", "Pre-market", "Post-market" */
  label: string;
  /** Minutes until the next state change (open→close or close→open) */
  minutesToNextEvent: number;
  /** Human-readable countdown: "2h 14m", "23m", "Opens Monday" */
  countdown: string;
  /** What happens next: "closes" or "opens" */
  nextEvent: "opens" | "closes";
  /** Current local time string in market timezone: "10:34 AM ET" */
  localTime: string;
};

export type DataFreshness = {
  /** Age in minutes */
  ageMinutes: number;
  /** Human-readable: "2m ago", "3h ago", "yesterday" */
  ageLabel: string;
  /** Whether this data should be considered stale given current market state */
  isStale: boolean;
  /** Warning message if stale, empty string if fresh */
  warning: string;
};

/* ── US DST detection ── */

/**
 * US DST: starts second Sunday of March, ends first Sunday of November.
 * During DST (EDT), offset is UTC-4. During EST, offset is UTC-5.
 */
function isUsDst(date: Date): boolean {
  const year = date.getUTCFullYear();

  // Second Sunday of March (DST starts at 2 AM local = 7 AM UTC in EST)
  const marchFirst = new Date(Date.UTC(year, 2, 1)); // March 1
  const marchFirstDay = marchFirst.getUTCDay(); // 0=Sun
  const secondSunday = 8 + ((7 - marchFirstDay) % 7); // day of month
  const dstStart = Date.UTC(year, 2, secondSunday, 7, 0, 0); // 2AM EST = 7AM UTC

  // First Sunday of November (DST ends at 2 AM local = 6 AM UTC in EDT)
  const novFirst = new Date(Date.UTC(year, 10, 1)); // November 1
  const novFirstDay = novFirst.getUTCDay();
  const firstSunday = 1 + ((7 - novFirstDay) % 7);
  const dstEnd = Date.UTC(year, 10, firstSunday, 6, 0, 0); // 2AM EDT = 6AM UTC

  const ts = date.getTime();
  return ts >= dstStart && ts < dstEnd;
}

/** US Eastern offset in hours: -4 (EDT) or -5 (EST) */
function usEasternOffset(date: Date): number {
  return isUsDst(date) ? -4 : -5;
}

/* ── Market hours (in UTC minutes from midnight) ── */

type MarketHours = {
  /** UTC minute of day when market opens */
  openUtc: number;
  /** UTC minute of day when market closes */
  closeUtc: number;
  /** Pre-market window starts this many minutes before open */
  preMarketMinutes: number;
  /** Post-market window lasts this many minutes after close */
  postMarketMinutes: number;
};

function getMarketHours(market: MarketId, now: Date): MarketHours {
  if (market === "IN") {
    // NSE: 9:15 AM - 3:30 PM IST (UTC+5:30)
    // In UTC: 3:45 AM - 10:00 AM (always, no DST)
    return {
      openUtc: 3 * 60 + 45,   // 03:45 UTC
      closeUtc: 10 * 60,       // 10:00 UTC
      preMarketMinutes: 30,    // 8:45 AM IST
      postMarketMinutes: 30,   // until 4:00 PM IST
    };
  }

  // US: 9:30 AM - 4:00 PM ET
  const offset = usEasternOffset(now); // -4 or -5
  // Convert local times to UTC: local + abs(offset) = UTC
  const absOffset = Math.abs(offset);
  return {
    openUtc: (9 * 60 + 30) + absOffset * 60,   // 13:30 or 14:30 UTC
    closeUtc: (16 * 60) + absOffset * 60,        // 20:00 or 21:00 UTC
    preMarketMinutes: 60,                         // 8:30 AM ET
    postMarketMinutes: 60,                        // until 5:00 PM ET
  };
}

/* ── Weekend / holiday detection ── */

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/** Get the next weekday from a given date (skips Sat/Sun) */
function nextWeekday(date: Date): Date {
  const next = new Date(date.getTime());
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (!isWeekday(next));
  return next;
}

/** Get the previous weekday */
function prevWeekday(date: Date): Date {
  const prev = new Date(date.getTime());
  do {
    prev.setUTCDate(prev.getUTCDate() - 1);
  } while (!isWeekday(prev));
  return prev;
}

/* ── Time formatting ── */

function formatCountdown(minutes: number): string {
  if (minutes < 0) return "now";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatAge(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    return `${h}h ago`;
  }
  if (minutes < 60 * 48) return "yesterday";
  const d = Math.floor(minutes / (60 * 24));
  return `${d}d ago`;
}

function formatLocalTime(date: Date, market: MarketId): string {
  if (market === "IN") {
    // IST is UTC+5:30
    const ist = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
    const h = ist.getUTCHours();
    const m = ist.getUTCMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm} IST`;
  }

  // US Eastern
  const offset = usEasternOffset(date);
  const et = new Date(date.getTime() + offset * 60 * 60 * 1000);
  const h = et.getUTCHours();
  const m = et.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const tzLabel = isUsDst(date) ? "EDT" : "EST";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm} ${tzLabel}`;
}

/* ── Main API ── */

/**
 * Get the current market status for a given market.
 */
export function getMarketStatus(market: MarketId, now: Date = new Date()): MarketStatus {
  const hours = getMarketHours(market, now);
  const utcMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const localTime = formatLocalTime(now, market);
  const weekday = isWeekday(now);

  // Weekend — market is closed
  if (!weekday) {
    const nextWd = nextWeekday(now);
    // Set to market open time on next weekday
    const nextOpenUtc = new Date(Date.UTC(
      nextWd.getUTCFullYear(), nextWd.getUTCMonth(), nextWd.getUTCDate(),
      Math.floor(hours.openUtc / 60), hours.openUtc % 60,
    ));
    const minsToOpen = (nextOpenUtc.getTime() - now.getTime()) / 60000;
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][nextWd.getUTCDay()];

    return {
      market,
      state: "closed",
      label: "Closed",
      minutesToNextEvent: minsToOpen,
      countdown: minsToOpen > 24 * 60 ? `Opens ${dayName}` : formatCountdown(minsToOpen),
      nextEvent: "opens",
      localTime,
    };
  }

  // Pre-market window
  const preMarketStart = hours.openUtc - hours.preMarketMinutes;
  if (utcMinute >= preMarketStart && utcMinute < hours.openUtc) {
    return {
      market,
      state: "pre_market",
      label: "Pre-market",
      minutesToNextEvent: hours.openUtc - utcMinute,
      countdown: formatCountdown(hours.openUtc - utcMinute),
      nextEvent: "opens",
      localTime,
    };
  }

  // Market open
  if (utcMinute >= hours.openUtc && utcMinute < hours.closeUtc) {
    return {
      market,
      state: "open",
      label: "Open",
      minutesToNextEvent: hours.closeUtc - utcMinute,
      countdown: formatCountdown(hours.closeUtc - utcMinute),
      nextEvent: "closes",
      localTime,
    };
  }

  // Post-market window
  const postMarketEnd = hours.closeUtc + hours.postMarketMinutes;
  if (utcMinute >= hours.closeUtc && utcMinute < postMarketEnd) {
    // Next open is tomorrow (or next weekday)
    const nextWd = nextWeekday(now);
    const nextHours = getMarketHours(market, nextWd);
    const nextOpenUtc = new Date(Date.UTC(
      nextWd.getUTCFullYear(), nextWd.getUTCMonth(), nextWd.getUTCDate(),
      Math.floor(nextHours.openUtc / 60), nextHours.openUtc % 60,
    ));
    const minsToOpen = (nextOpenUtc.getTime() - now.getTime()) / 60000;

    return {
      market,
      state: "post_market",
      label: "Post-market",
      minutesToNextEvent: minsToOpen,
      countdown: formatCountdown(minsToOpen),
      nextEvent: "opens",
      localTime,
    };
  }

  // Closed (before pre-market or after post-market on a weekday)
  let minsToNext: number;
  let nextEvent: "opens" | "closes";

  if (utcMinute < preMarketStart) {
    // Before pre-market today — next event is market open today
    minsToNext = hours.openUtc - utcMinute;
    nextEvent = "opens";
  } else {
    // After post-market — next event is open on next weekday
    const nextWd = nextWeekday(now);
    const nextHours = getMarketHours(market, nextWd);
    const nextOpenUtc = new Date(Date.UTC(
      nextWd.getUTCFullYear(), nextWd.getUTCMonth(), nextWd.getUTCDate(),
      Math.floor(nextHours.openUtc / 60), nextHours.openUtc % 60,
    ));
    minsToNext = (nextOpenUtc.getTime() - now.getTime()) / 60000;
    nextEvent = "opens";
  }

  return {
    market,
    state: "closed",
    label: "Closed",
    minutesToNextEvent: minsToNext,
    countdown: formatCountdown(minsToNext),
    nextEvent,
    localTime,
  };
}

/**
 * Check how fresh a piece of data is and whether it should be flagged as stale.
 */
export function getDataFreshness(
  lastUpdated: string | Date,
  market: MarketId,
  /** Max acceptable age in minutes before flagging as stale during market hours */
  maxAgeOpenMinutes: number = 90,
  /** Max acceptable age when market is closed (more lenient) */
  maxAgeClosedMinutes: number = 60 * 24,
  now: Date = new Date(),
): DataFreshness {
  const updatedAt = typeof lastUpdated === "string" ? new Date(lastUpdated) : lastUpdated;
  const ageMs = now.getTime() - updatedAt.getTime();
  const ageMinutes = Math.max(0, ageMs / 60000);
  const ageLabel = formatAge(ageMinutes);

  const status = getMarketStatus(market, now);
  const maxAge = status.state === "open" ? maxAgeOpenMinutes : maxAgeClosedMinutes;
  const isStale = ageMinutes > maxAge;

  let warning = "";
  if (isStale && status.state === "open") {
    warning = `Prices may be delayed (updated ${ageLabel})`;
  } else if (ageMinutes > 60 * 24) {
    warning = `Last updated ${ageLabel}`;
  }

  return { ageMinutes, ageLabel, isStale, warning };
}

/**
 * Recommended refresh cadences per data type.
 * Used by the scheduler to decide what to refresh.
 */
export const REFRESH_CADENCES = {
  /** Price-only refresh (yfinance, no LLM) */
  prices: {
    duringMarketHours: 60,    // every 60 minutes
    outsideMarketHours: null,  // don't refresh
    preMarket: 30,             // every 30 minutes in pre-market
    postMarket: null,
  },
  /** Portfolio brief (narrative, movers, heatmap vibes) */
  portfolioBrief: {
    duringMarketHours: 180,   // every 3 hours
    outsideMarketHours: null,
    preMarket: 0,              // once at pre-market start
    postMarket: 0,             // once at post-market start
  },
  /** Signals ("your world right now") */
  signals: {
    duringMarketHours: null,
    outsideMarketHours: null,
    preMarket: 0,              // once at pre-market
    postMarket: 0,             // once at post-market
  },
  /** Full stock intelligence (SearXNG + LLM per stock) */
  stockIntelligence: {
    duringMarketHours: 360,   // every 6 hours
    outsideMarketHours: null,
    preMarket: 0,              // once at pre-market
    postMarket: 0,             // once at post-market
  },
} as const;
