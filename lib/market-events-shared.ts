export type MarketEventKind = "earnings";

export type MarketEvent = {
  id: string;
  kind: MarketEventKind | string;
  scope: string;
  market: "US" | "IN";
  ticker: string;
  instrument_id: string;
  name: string;
  sector: string;
  logo_url: string | null;
  title: string;
  body: string;
  direction: "positive" | "negative" | "neutral" | string;
  urgency: number;
  evidence: string[];
  all_sources?: string[];
  day_change_pct?: number | null;
  price?: number | null;
  score?: number | null;
  reddit_mentions?: number | null;
  reddit_sentiment?: string | null;
  event_date?: string | null;
  generated_at?: string | null;
  scenarios?: MarketEventScenario[];
};

export type MarketEventScenario = {
  case: "bull" | "base" | "bear";
  probability_pct: number;
};

function parseEventDate(value: string | null | undefined): number {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
}

export function sortEventsByReportDate(events: MarketEvent[]): MarketEvent[] {
  return [...events].sort((a, b) => {
    const dateDiff = parseEventDate(b.event_date) - parseEventDate(a.event_date);
    if (dateDiff !== 0) return dateDiff;
    return (b.urgency ?? 0) - (a.urgency ?? 0);
  });
}

export function formatReportSectionLabel(dateKey: string): string {
  if (dateKey === "unknown") return "Date unknown";
  const t = Date.parse(dateKey);
  if (!Number.isFinite(t)) return dateKey;
  const day = new Date(t);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compare = new Date(day);
  compare.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - compare.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function groupEventsByReportDate(
  events: MarketEvent[],
): { dateKey: string; label: string; events: MarketEvent[] }[] {
  const sorted = sortEventsByReportDate(events);
  const groups = new Map<string, MarketEvent[]>();
  for (const event of sorted) {
    const key = event.event_date?.trim() || "unknown";
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()].map(([dateKey, groupEvents]) => ({
    dateKey,
    label: formatReportSectionLabel(dateKey),
    events: groupEvents,
  }));
}

function parseUtcDateKey(dateKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatUpcomingSectionLabel(dateKey: string, ref = new Date()): string {
  if (dateKey === "unknown") return "Date unknown";
  const event = parseUtcDateKey(dateKey);
  if (!event) return dateKey;
  const today = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  const compare = new Date(event);
  compare.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.round((compare.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  return event.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function sortEventsByUpcomingDate(events: MarketEvent[]): MarketEvent[] {
  return [...events].sort((a, b) => {
    const dateDiff = parseEventDate(a.event_date) - parseEventDate(b.event_date);
    if (dateDiff !== 0) return dateDiff;
    return (b.urgency ?? 0) - (a.urgency ?? 0);
  });
}

export function groupUpcomingByReportDate(
  events: MarketEvent[],
  ref = new Date(),
): { dateKey: string; label: string; events: MarketEvent[] }[] {
  const sorted = sortEventsByUpcomingDate(events);
  const groups = new Map<string, MarketEvent[]>();
  for (const event of sorted) {
    const key = event.event_date?.trim() || "unknown";
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()].map(([dateKey, groupEvents]) => ({
    dateKey,
    label: formatUpcomingSectionLabel(dateKey, ref),
    events: groupEvents,
  }));
}
