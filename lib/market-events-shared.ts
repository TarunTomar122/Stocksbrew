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
