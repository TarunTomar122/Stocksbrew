"use client";

import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { EarningsScenarioBar } from "@/components/earnings-scenario-bar";
import { groupEventsByReportDate, type MarketEvent } from "@/lib/market-events-shared";

function fmtPrice(v: number, market: MarketEvent["market"]): string {
  if (!Number.isFinite(v)) return "—";
  const symbol = market === "IN" ? "₹" : "$";
  if (v >= 1000) return `${symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${symbol}${v.toFixed(2)}`;
}

function fmtPct(v: number): string {
  return `${Math.abs(v).toFixed(2)}%`;
}

function hookLine(event: MarketEvent): string {
  const first = event.evidence.find((e) => e.trim());
  if (first && first.length <= 120) return first;
  return event.title;
}

function EventCard({ event }: { event: MarketEvent }) {
  const href = event.ticker ? `/stock/${encodeURIComponent(event.ticker)}` : null;
  const hasPrice = typeof event.price === "number";
  const hasChange = typeof event.day_change_pct === "number";
  const isUp = hasChange ? event.day_change_pct! >= 0 : event.direction === "positive";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const changeBg = isUp ? "#ecfdf5" : "#fef2f2";
  const hook = hookLine(event);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {event.ticker ? (
            <StockLogo ticker={event.ticker} market={event.market} size={36} logoUrl={event.logo_url} />
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            {event.ticker && (
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
                {event.ticker}
              </span>
            )}
            {event.name ? (
              <span className="truncate text-[11px] text-[#9ca3af] max-w-[140px]">{event.name}</span>
            ) : null}
          </div>
        </div>
        {hasChange && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums"
            style={{ background: changeBg, color: changeColor }}
          >
            {isUp ? "▲" : "▼"} {fmtPct(event.day_change_pct!)}
          </span>
        )}
      </div>

      {hasPrice && (
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
          {fmtPrice(event.price!, event.market)}
        </span>
      )}

      {hook && (
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-[#111111] group-hover:text-[#0052ff] transition-colors">
          {hook}
        </p>
      )}

      <EarningsScenarioBar scenarios={event.scenarios} className="mt-auto pt-1" />
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
}: {
  events: MarketEvent[];
  summary: string;
  generatedAt: string;
}) {
  const relative = (() => {
    const t = Date.parse(generatedAt || "");
    if (!Number.isFinite(t)) return "";
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  })();

  const sections = groupEventsByReportDate(events);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0 self-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          </span>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] text-[#111111] md:text-[40px]">
            Earnings
          </h1>
          {relative && (
            <span className="text-[12px] font-medium text-[#9ca3af]">Updated {relative}</span>
          )}
        </div>
        <p className="max-w-[720px] text-[16px] leading-[1.6] text-[#374151] md:text-[18px]">
          {summary || "Fresh post-earnings reports from stocks that recently reported, ranked by impact."}
        </p>
      </header>

      {events.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[#e5e7eb] bg-[#fafafa] p-10 text-center">
          <p className="text-[13px] text-[#6b7280] italic">No earnings reports right now.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.dateKey} className="flex flex-col gap-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">
                  {section.label}
                </h2>
                {section.dateKey !== "unknown" && (
                  <span className="text-[12px] font-medium tabular-nums text-[#9ca3af]">
                    {section.dateKey}
                  </span>
                )}
                <span className="text-[12px] text-[#9ca3af]">
                  · {section.events.length} report{section.events.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                {section.events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
