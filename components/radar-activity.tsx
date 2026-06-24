"use client";

import type { RadarActivityEvent } from "@/lib/activity-events";

type EventItem = RadarActivityEvent;

function toneStyles(direction: string): { dot: string; chip: string; chipText: string } {
  const d = (direction || "").toLowerCase();
  if (["positive", "bullish", "up", "good"].includes(d)) {
    return { dot: "#10b981", chip: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))", chipText: "#10b981" };
  }
  if (["negative", "bearish", "down", "bad", "risk", "warning"].includes(d)) {
    return { dot: "#ef4444", chip: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", chipText: "#ef4444" };
  }
  return { dot: "var(--on-surface-variant)", chip: "var(--surface-container)", chipText: "var(--on-surface)" };
}

function TodayMarketEventCard({ event }: { event: EventItem }) {
  const tone = toneStyles(event.direction);
  const eventType = (event.event_type || "event").replaceAll("_", " ");
  const title = event.title || event.sentence;
  return (
    <article className="flex h-full flex-col gap-2.5 rounded-2xl border border-outline-variant bg-surface p-4">
      <span
        className="inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ background: tone.chip, color: tone.chipText }}
      >
        {eventType}
      </span>
      <p className="text-[13px] font-medium leading-snug text-on-surface line-clamp-3">
        {title}
      </p>
    </article>
  );
}

export function TodayMarketEvents({ events }: { events: EventItem[] }) {
  const headline = events.slice(0, 3);
  if (headline.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-2 w-2 shrink-0 rounded-full bg-[#6b7280]" />
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface">
          Market-wide
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-on-surface-variant">
          {headline.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {headline.map((event, i) => (
          <TodayMarketEventCard key={`market-${i}-${event.event_type}`} event={event} />
        ))}
      </div>
    </div>
  );
}
