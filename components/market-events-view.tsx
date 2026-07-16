"use client";

import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { earningsIntelHref, firstSentence, pickEarningsHookLine } from "@/lib/earnings-facts";
import {
  groupEventsByReportDate,
  type MarketEvent,
} from "@/lib/market-events-shared";
import { SHOW_DATA_FRESHNESS_UI, freshnessInfo, relativeTime } from "@/lib/freshness";

function fmtPrice(v: number, market: MarketEvent["market"]): string {
  if (!Number.isFinite(v)) return "—";
  const symbol = market === "IN" ? "₹" : "$";
  if (v >= 1000)
    return `${symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${symbol}${v.toFixed(2)}`;
}


function cardCopy(event: MarketEvent): string {
  const body = String(event.body ?? "").trim();
  const raw = body || pickEarningsHookLine(event.evidence, event.title);
  return firstSentence(raw);
}

function EventCard({ event, predicted }: { event: MarketEvent; predicted?: boolean }) {
  const href = event.ticker ? earningsIntelHref(event.ticker) : null;
  const hasPrice = typeof event.price === "number";
  const copy = cardCopy(event);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {event.ticker ? (
            <StockLogo
              ticker={event.ticker}
              market={event.market}
              size={36}
              logoUrl={event.logo_url}
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            {event.ticker && (
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
                {event.ticker}
              </span>
            )}
            {event.name ? (
              <span className="truncate text-[11px] text-[#9ca3af] max-w-[140px]">
                {event.name}
              </span>
            ) : null}
          </div>
        </div>
        {predicted && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-semibold text-[#16a34a]">
            ✓ We saw it coming
          </span>
        )}
      </div>

      {hasPrice && (
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
          {fmtPrice(event.price!, event.market)}
        </span>
      )}

      {copy ? (
        <p className="text-[13px] font-medium leading-relaxed text-[#111111] group-hover:text-[#0052ff] transition-colors">
          {copy}
        </p>
      ) : null}

    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
      >
        {inner}
      </Link>
    );
  }

  return (
    <article className="flex h-full flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-4">
      {inner}
    </article>
  );
}

export function MarketEventsView({
  events,
  summary,
  generatedAt,
  predictionHits,
  afterHeader,
}: {
  events: MarketEvent[];
  summary: string;
  generatedAt: string;
  predictionHits?: Set<string>;
  afterHeader?: React.ReactNode;
}) {
  const freshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(generatedAt, { agingHours: 24, staleHours: 72 })
    : null;

  const sections = groupEventsByReportDate(events);
  const hasReported = events.length > 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[32px] font-semibold tracking-[-0.02em] text-[#111111] md:text-[40px]">
            Earnings
          </h2>
          {hasReported && relativeTime(generatedAt) && (
            <span className="text-[12px] font-medium text-[#9ca3af]">
              Updated {relativeTime(generatedAt)}
            </span>
          )}
          {SHOW_DATA_FRESHNESS_UI && hasReported && freshness ? (
            <span className={`text-[12px] font-medium ${freshness.toneClass}`}>
              {freshness.label}
            </span>
          ) : null}
        </div>
        <p className="max-w-[720px] text-[16px] leading-[1.6] text-[#374151] md:text-[18px]">
          {summary ||
            "Fresh post-earnings reports from stocks that recently reported, ranked by impact."}
        </p>
      </header>

      {afterHeader}

      {!hasReported ? (
        <div className="rounded-[20px] border border-dashed border-[#e5e7eb] bg-[#fafafa] p-10 text-center">
          <p className="text-[13px] text-[#6b7280] italic">
            No fresh earnings reports right now.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.dateKey} className="flex flex-col gap-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">
                  {section.label}
                </h2>
                {section.dateKey !== "unknown" ? (
                  <span className="text-[12px] font-medium tabular-nums text-[#9ca3af]">
                    {section.dateKey}
                  </span>
                ) : null}
                <span className="text-[12px] text-[#9ca3af]">
                  · {section.events.length} report
                  {section.events.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {section.events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    predicted={predictionHits?.has(event.instrument_id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
