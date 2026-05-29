"use client";

import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { RadarActivityEvent } from "@/lib/activity-events";

type EventItem = RadarActivityEvent;

function toneStyles(direction: string): { dot: string; chip: string; chipText: string } {
  const d = (direction || "").toLowerCase();
  if (["positive", "bullish", "up", "good"].includes(d)) {
    return { dot: "#10b981", chip: "#ecfdf5", chipText: "#047857" };
  }
  if (["negative", "bearish", "down", "bad", "risk", "warning"].includes(d)) {
    return { dot: "#ef4444", chip: "#fef2f2", chipText: "#b91c1c" };
  }
  return { dot: "#6b7280", chip: "#f3f4f6", chipText: "#374151" };
}

function marketFromSymbol(symbol: string): "US" | "IN" {
  return symbol.toUpperCase().startsWith("IN_") || symbol.toUpperCase().endsWith(".NS")
    ? "IN"
    : "US";
}

function cleanSymbol(symbol: string): string {
  return symbol.replace(/^US_/i, "").replace(/^IN_/i, "").replace(/\.NS$/i, "");
}

function BookEventCard({ event }: { event: EventItem }) {
  const tone = toneStyles(event.direction);
  const eventType = (event.event_type || "event").replaceAll("_", " ");
  const sym = cleanSymbol(event.symbol || "");
  const title = event.title || event.sentence;
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-[#f3f4f6] bg-[#fafafa] p-3">
      <div className="flex items-start gap-2.5">
        {sym ? (
          <StockLogo ticker={sym} market={marketFromSymbol(event.symbol)} size={32} />
        ) : (
          <span
            aria-hidden
            className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full"
            style={{ background: tone.dot }}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
              style={{ background: tone.chip, color: tone.chipText }}
            >
              {eventType}
            </span>
            {sym && (
              <Link
                href={`/stock/${encodeURIComponent(sym)}`}
                className="text-[11px] font-semibold text-[#111111] hover:text-[#0052ff] transition-colors"
              >
                {sym}
              </Link>
            )}
          </div>
          <p className="text-[12px] font-semibold leading-snug text-[#111111] line-clamp-3">
            {title}
          </p>
        </div>
      </div>
    </article>
  );
}

function BookEventCompactRow({ event }: { event: EventItem }) {
  const tone = toneStyles(event.direction);
  const eventType = (event.event_type || "event").replaceAll("_", " ");
  const sym = cleanSymbol(event.symbol || "");
  return (
    <li className="border-t border-[#f3f4f6] py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: tone.dot }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
              {eventType}
            </span>
            {sym && (
              <Link
                href={`/stock/${encodeURIComponent(sym)}`}
                className="text-[11px] font-semibold text-[#111111] hover:text-[#0052ff] transition-colors"
              >
                {sym}
              </Link>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-[#6b7280] line-clamp-2">
            {event.title || event.sentence}
          </p>
        </div>
      </div>
    </li>
  );
}

export function BookEventsPanel({ events }: { events: EventItem[] }) {
  const headline = events.slice(0, 3);
  const rest = events.slice(3);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff6ff] text-[14px]"
          >
            📰
          </span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#1e3a8a]">
            Your book
          </span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
          {events.length}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="text-[12px] italic text-[#9ca3af]">
          All quiet. No book events today.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {headline.map((event, i) => (
              <BookEventCard key={`book-${i}-${event.symbol || event.event_type}`} event={event} />
            ))}
          </div>
          {rest.length > 0 && (
            <ul className="flex flex-col">
              {rest.map((event, i) => (
                <BookEventCompactRow
                  key={`book-rest-${i}-${event.symbol || event.event_type}`}
                  event={event}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TodayMarketEventCard({ event }: { event: EventItem }) {
  const tone = toneStyles(event.direction);
  const eventType = (event.event_type || "event").replaceAll("_", " ");
  const title = event.title || event.sentence;
  return (
    <article className="flex h-full flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <span
        className="inline-flex w-fit items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ background: tone.chip, color: tone.chipText }}
      >
        {eventType}
      </span>
      <p className="text-[13px] font-medium leading-snug text-[#111111] line-clamp-3">
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
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#374151]">
          Market-wide
        </span>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">
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
