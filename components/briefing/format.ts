import type { BriefingItem, BriefingKind } from "@/lib/briefing";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const KIND_LABEL: Record<BriefingKind, string> = {
  price_move: "Price move",
  call_changed: "Call changed",
  zone_entered: "Price zone",
  earnings_upcoming: "Earnings ahead",
  earnings_reported: "Earnings",
  congress_trade: "Congress",
  news: "News",
  alert_triggered: "Your alert",
  discussion_spike: "Discussion",
  filing: "Filing",
  technical: "Chart",
  agent_job: "Your job",
};

/** A share price the one way the briefing shows it: "$173.85", and no cents from $1,000 up ("$1,204"). Null without one. */
export function sharePrice(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const cents = value < 1000 ? 2 : 0;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}`;
}

/** "2026-11-09" -> "Mon, Nov 9". Parsed by hand so no timezone can shift the day. */
export function longDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!match) return "";
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${WEEKDAYS[new Date(ms).getUTCDay()]}, ${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

export function shortDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : "";
}

const TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** A source time: "Nov 9" for a date, "Nov 9, 2:41 PM ET" for an instant. */
export function sourceTime(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return shortDay(value);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  return `${TIME.format(new Date(ms))} ET`;
}

const CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * A source time for a dense row: "2:41 PM ET" when it is from `day` (New York
 * time), the usual "Nov 9, 2:41 PM ET" otherwise, "Nov 12" for a plain date.
 */
export function compactTime(value: string | null | undefined, day: string): string {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return sourceTime(value);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  return ET_DAY.format(date) === day ? `${CLOCK.format(date)} ET` : sourceTime(value);
}

const WEEKDAY_RE = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;

/**
 * The stale-price note in plain words: "Prices as of Monday's close." Also
 * reads notes saved by older briefings, which explained the mechanics.
 */
export function pricesLine(note: string | null | undefined): string | null {
  if (!note) return null;
  if (/^Prices as of /.test(note)) return note;
  const day = WEEKDAY_RE.exec(note)?.[1];
  return day ? `Prices as of ${day}'s close.` : "Prices as of the last close.";
}

export function toneText(tone: BriefingItem["tone"]): string {
  if (tone === "up") return "text-signal-bullish";
  if (tone === "down") return "text-signal-bearish";
  return "text-oa-fg";
}

/** "+23.9%", "−0.4%". A move that rounds to zero carries no sign, so −0.04 never reads as a red "−0.0%". */
export function signedPct(value: number, digits = 2): string {
  const shown = Math.abs(value).toFixed(digits);
  const sign = Number(shown) === 0 ? "" : value >= 0 ? "+" : "−";
  return `${sign}${shown}%`;
}

export function signedMoney(value: number): string {
  return `${value >= 0 ? "+" : "−"}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

export function relationLabel(relation: BriefingItem["relation"]): string {
  if (relation === "holding") return "You hold";
  if (relation === "watching") return "Watching";
  return "Market";
}
