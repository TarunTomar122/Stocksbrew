import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { EarningsScenarioBar } from "@/components/earnings-scenario-bar";
import type { MarketEvent } from "@/lib/market-events-shared";

function fmtPrice(v: number, market: MarketEvent["market"]): string {
  if (!Number.isFinite(v)) return "—";
  const symbol = market === "IN" ? "₹" : "$";
  if (v >= 1000) return `${symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `${symbol}${v.toFixed(2)}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function HomeEventsStrip({ events }: { events: MarketEvent[] }) {
  const top = events.slice(0, 5);
  if (top.length === 0) return null;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#f59e0b]" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
              Fresh reports
            </span>
          </div>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#111111] md:text-[28px]">
            Earnings
          </h2>
        </div>
        <Link
          href="/events"
          className="shrink-0 text-[13px] font-semibold text-[#0052ff] hover:underline"
        >
          See all →
        </Link>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-5 md:overflow-visible md:pb-0">
        {top.map((event) => {
          const hasPrice = typeof event.price === "number";
          const hasChange = typeof event.day_change_pct === "number";
          const positive = (event.day_change_pct ?? 0) >= 0;
          const changeColor = positive ? "#047857" : "#b91c1c";

          return (
            <div
              key={event.id}
              className="snap-start shrink-[0.85] md:shrink-0 min-w-[260px] md:min-w-0 flex flex-col"
            >
              <Link
                href={event.ticker ? `/stock/${encodeURIComponent(event.ticker)}` : "/events"}
                className="group flex h-full flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {event.ticker && (
                      <StockLogo ticker={event.ticker} market={event.market} size={28} logoUrl={event.logo_url} />
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[12px] font-semibold tabular-nums text-[#111111] group-hover:text-[#0052ff]">
                        {event.ticker}
                      </span>
                      {event.event_date && (
                        <span className="text-[10px] font-medium tabular-nums text-[#9ca3af]">
                          {event.event_date}
                        </span>
                      )}
                    </div>
                  </div>
                  {(hasPrice || hasChange) && (
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {hasPrice && (
                        <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
                          {fmtPrice(event.price!, event.market)}
                        </span>
                      )}
                      {hasChange && (
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{ color: changeColor }}
                        >
                          {fmtPct(event.day_change_pct!)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[13px] font-medium leading-snug text-[#111111] line-clamp-3 group-hover:text-[#0052ff]">
                  {event.title}
                </p>
                <EarningsScenarioBar scenarios={event.scenarios} compact className="mt-auto pt-1" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
