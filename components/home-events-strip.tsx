import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { EarningsScenarioBar } from "@/components/earnings-scenario-bar";
import type { MarketEvent } from "@/lib/market-events-shared";
import { relativeTime } from "@/lib/freshness";

function fmtPrice(v: number, market: MarketEvent["market"]): string {
  if (!Number.isFinite(v)) return "—";
  const symbol = market === "IN" ? "₹" : "$";
  if (v >= 1000) return `${symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${symbol}${v.toFixed(2)}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function EarningsEventCard({ event }: { event: MarketEvent }) {
  const hasPrice = typeof event.price === "number";
  const hasChange = typeof event.day_change_pct === "number";
  const isUp = hasChange
    ? event.day_change_pct! >= 0
    : event.direction === "positive";
  const changeColor = isUp ? "#10b981" : "#ef4444";
  const detail = (event.body || event.evidence.find((e) => e.trim()) || "").trim();
  const showDetail = detail && detail !== event.title;

  const dayChangeAbs =
    hasPrice && hasChange
      ? (event.price! * event.day_change_pct!) / (100 + event.day_change_pct!)
      : null;

  return (
    <Link
      href={event.ticker ? `/stock/${encodeURIComponent(event.ticker)}` : "/events"}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
    >
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
          <div className="flex min-w-0 flex-col">
            <span className="text-[14px] font-semibold tracking-tight text-[#111111] transition-colors group-hover:text-[#0052ff]">
              {event.ticker}
            </span>
            <span className="max-w-[120px] truncate text-[11px] text-[#9ca3af]">
              {event.name || event.event_date || ""}
            </span>
          </div>
        </div>
        {hasChange && (
          <span
            className="shrink-0 text-[14px] font-bold tabular-nums"
            style={{ color: changeColor }}
          >
            {isUp ? "▲" : "▼"} {fmtPct(event.day_change_pct!)}
          </span>
        )}
      </div>

      {hasPrice && (
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
            {fmtPrice(event.price!, event.market)}
          </span>
          {dayChangeAbs != null && Number.isFinite(dayChangeAbs) && (
            <span
              className="text-[11px] font-medium tabular-nums"
              style={{ color: changeColor }}
            >
              {isUp ? "+" : ""}
              {dayChangeAbs.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {event.title ? (
        <p className="line-clamp-2 text-[13px] leading-snug text-[#111111] group-hover:text-[#0052ff]">
          {event.title}
        </p>
      ) : null}

      {showDetail && (
        <p className="line-clamp-2 text-[12px] leading-snug text-[#6b7280]">{detail}</p>
      )}

      <div className="mt-auto min-h-[20px]">
        <EarningsScenarioBar scenarios={event.scenarios} compact />
      </div>
    </Link>
  );
}

export function HomeEventsStrip({ events, generatedAt }: { events: MarketEvent[]; generatedAt?: string | null }) {
  const top = events.slice(0, 4);
  if (top.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
            Fresh reports
          </span>
          <Link
            href="/events"
            className="group/title inline-flex items-center gap-1.5 text-[18px] font-semibold tracking-[-0.015em] text-[#111111] hover:text-[#0052ff] transition-colors"
          >
            Earnings
            <span className="text-[14px] text-[#9ca3af] group-hover/title:text-[#0052ff] group-hover/title:translate-x-0.5 transition-all">→</span>
          </Link>
          <p className="text-[12px] text-[#6b7280]">
            We read every report and tell you what it means.
            {generatedAt && (
              <span className="text-[#9ca3af]"> Updated {relativeTime(generatedAt)}.</span>
            )}
          </p>
        </div>
        <Link
          href="/upcoming-events"
          className="group/up inline-flex w-full shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-semibold text-[#111111] hover:border-[#111111] transition-colors sm:w-auto sm:py-1.5"
        >
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.06em] uppercase text-[#92400e]">
            ★ Pro
          </span>
          <span className="flex-1 sm:flex-none">We call them before they report</span>
          <span className="text-[#9ca3af] group-hover/up:translate-x-0.5 transition-transform">→</span>
        </Link>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
        {top.map((event) => (
          <div
            key={event.id}
            className="flex min-w-[260px] shrink-[0.85] snap-start flex-col md:min-w-0 md:shrink-0"
          >
            <EarningsEventCard event={event} />
          </div>
        ))}
      </div>
    </section>
  );
}
