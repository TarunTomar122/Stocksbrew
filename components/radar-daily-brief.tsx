"use client";

import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { RadarAttentionItem, RadarUserView } from "@/lib/watchlist-view";

type RadarUpcomingEvent = RadarUserView["upcoming_events"][number];

const EVENT_LABELS: Record<string, string> = {
  rsi_oversold_cross: "Technical",
  rsi_overbought_cross: "Technical",
  rsi_return_to_neutral: "Technical",
  analyst_rating_change: "Analyst revision",
  analyst_target_revision: "Price target",
  earnings_upcoming: "Earnings",
  earnings_results: "Earnings",
  earnings_guidance_change: "Guidance",
  filing_catalyst: "Official filing",
  abnormal_price_move: "Unusual move",
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const deltaDays = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (deltaDays === 0) return "today";
  if (deltaDays === 1) return "tomorrow";
  if (deltaDays === -1) return "yesterday";
  if (deltaDays > 1 && deltaDays < 7) return `in ${deltaDays} days`;
  if (deltaDays < -1 && deltaDays > -7) return `${Math.abs(deltaDays)} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatCalendarDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function daysUntil(value: string): number | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

function AttentionRow({ item, index }: { item: RadarAttentionItem; index: number }) {
  const market = item.instrument_id.startsWith("IN_") ? "IN" : "US";
  const marker =
    item.direction === "positive"
      ? "bg-emerald-500"
      : item.direction === "negative"
        ? "bg-red-500"
        : "bg-amber-500";
  const showInsight =
    item.event_type !== "earnings_upcoming" &&
    Boolean(item.why_it_matters || item.next_trigger);

  return (
    <article className="border-t border-outline-variant/55 py-5">
      <div className="flex items-start gap-4">
        <div className="hidden w-7 shrink-0 font-mono text-[11px] tabular-nums text-on-surface-variant md:block">
          0{index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <StockLogo ticker={item.ticker} market={market} size={24} />
            <Link
              href={`/stock/${encodeURIComponent(item.ticker)}`}
              className="font-mono text-[13px] font-bold text-on-surface hover:underline"
            >
              {item.ticker}
            </Link>
            <span className={`h-1.5 w-1.5 rounded-full ${marker}`} aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-[0.11em] text-on-surface-variant">
              {EVENT_LABELS[item.event_type] ?? item.event_type.replaceAll("_", " ")}
            </span>
            {item.position_type ? (
              <span className="font-mono text-[10px] text-on-surface-variant">
                {item.position_type === "holding" ? "holding" : "watching"}
              </span>
            ) : null}
          </div>
          <h3 className="mt-3 text-[17px] font-bold leading-snug tracking-[-0.01em] text-on-surface">
            {item.headline}
          </h3>
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">
            {item.what_changed}
          </p>
          {showInsight ? (
            <div className="mt-3 max-w-3xl border-l-2 border-outline-variant/70 pl-4">
              {item.why_it_matters ? (
                <p className="text-[13px] leading-relaxed text-on-surface">{item.why_it_matters}</p>
              ) : null}
              {item.next_trigger ? (
                <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">
                  <span className="font-semibold text-on-surface">Watch:</span> {item.next_trigger}
                </p>
              ) : null}
            </div>
          ) : null}
          {item.citations.some((citation) => citation.url) ? (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {item.citations.filter((citation) => citation.url).slice(0, 2).map((citation) => (
                <a
                  key={`${citation.url}-${citation.title}`}
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-on-surface-variant underline decoration-outline-variant underline-offset-2 hover:text-on-surface"
                >
                  {citation.publisher || citation.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function UpcomingCalendar({ events }: { events: RadarUpcomingEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="border-t border-outline-variant/55 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-on-surface-variant">
          Earnings calendar
        </p>
        <span className="font-mono text-[10px] text-on-surface-variant">
          {events.length} on your book
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {events.slice(0, 8).map((event) => {
          const market = event.instrument_id.startsWith("IN_") ? "IN" : "US";
          const delta = daysUntil(event.expected_at);
          const urgency =
            delta !== null && delta >= 0 && delta <= 3
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-outline-variant/60 bg-surface-container-lowest";
          return (
            <Link
              key={`${event.instrument_id}-${event.expected_at}`}
              href={`/stock/${encodeURIComponent(event.ticker)}`}
              className={`flex items-center gap-3 border px-3 py-2.5 transition-colors hover:bg-surface-container-low ${urgency}`}
            >
              <StockLogo ticker={event.ticker} market={market} size={22} />
              <div className="min-w-0">
                <p className="font-mono text-[12px] font-bold text-on-surface">{event.ticker}</p>
                <p className="truncate text-[11px] text-on-surface-variant">
                  {formatCalendarDate(event.expected_at)}
                </p>
              </div>
              {delta !== null && delta >= 0 ? (
                <span className="ml-auto shrink-0 font-mono text-[10px] text-on-surface-variant">
                  {delta === 0 ? "today" : delta === 1 ? "1d" : `${delta}d`}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function RadarDailyBrief({ view }: { view: RadarUserView }) {
  const items = view.attention_items.slice(0, 3);
  const hasAttention = items.length > 0;
  const upcoming = view.upcoming_events;

  return (
    <section aria-labelledby="radar-daily-brief-title" className="overflow-hidden border border-outline-variant bg-surface">
      <div className="grid gap-5 bg-surface-container-low px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              Today&apos;s brief
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">
              · {formatWhen(view.generated_at)}
            </span>
          </div>
          <h2
            id="radar-daily-brief-title"
            className="mt-2 max-w-3xl text-[22px] font-extrabold leading-tight tracking-[-0.025em] text-on-surface sm:text-[26px]"
          >
            {view.narrative.headline}
          </h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">
            {view.narrative.body}
          </p>
        </div>
        <div className="font-mono text-[11px] text-on-surface-variant">
          {hasAttention
            ? `${items.length} ${items.length === 1 ? "change" : "changes"} need attention`
            : upcoming.length > 0
              ? `${upcoming.length} earnings ahead`
              : "No action needed"}
        </div>
      </div>

      <div className="px-5 sm:px-6">
        {hasAttention ? (
          items.map((item, index) => <AttentionRow key={item.item_id} item={item} index={index} />)
        ) : null}

        <UpcomingCalendar events={upcoming} />
      </div>
    </section>
  );
}
