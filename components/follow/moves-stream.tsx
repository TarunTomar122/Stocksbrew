import * as React from "react";

import {
  DOWN,
  ExternalLink,
  PartyDot,
  Ticker,
  UP,
} from "@/components/follow/bits";
import {
  actionLabel,
  actionTone,
  activitySize,
  daysBetween,
  fmtDate,
  quarterLabel,
  sourceHref,
  type ActivityItem,
  type FollowActivity,
} from "@/lib/follow-shared";

function MoveItem({ item }: { item: ActivityItem }) {
  const size = activitySize(item);
  const label = item.ticker
    ? null
    : (item.name ?? "").split(" ").slice(0, 4).join(" ");
  if (!item.ticker && !label) return null;
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap text-[13px]">
      <span
        className={`oa-mono text-[10.5px] uppercase tracking-[0.06em] ${actionTone(item.action) === "up" ? UP : DOWN}`}
      >
        {actionLabel(item.action)}
      </span>
      {item.ticker ? (
        <Ticker ticker={item.ticker} />
      ) : (
        <span className="text-oa-fg">{label}</span>
      )}
      {size ? (
        <span className="oa-mono text-[11.5px] text-oa-muted-fg">{size}</span>
      ) : null}
    </span>
  );
}

/** When it was filed against when it happened: the lag is the whole point of reading these. */
function timing(event: FollowActivity): string {
  if (event.kind === "fund") {
    const lag = daysBetween(event.period, event.date);
    const quarter = quarterLabel(event.period);
    if (!quarter) return "";
    return lag != null
      ? `Holdings as of ${fmtDate(event.period, false)} (${quarter}), filed ${lag} days later`
      : `Holdings for ${quarter}`;
  }
  if (!event.traded_from) return "";
  const lag = daysBetween(event.traded_to, event.date);
  const span =
    event.traded_from === event.traded_to
      ? `Traded ${fmtDate(event.traded_from, false)}`
      : `Traded ${fmtDate(event.traded_from, false)} to ${fmtDate(event.traded_to, false)}`;
  return lag != null
    ? `${span}, filed ${lag} day${lag === 1 ? "" : "s"} after the last one`
    : span;
}

/** What was just filed, newest first: who, what, how big, and filed when against traded when. */
export function MovesStream({
  events,
  emptyText,
  showName = true,
}: {
  events: FollowActivity[];
  emptyText: string;
  showName?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="px-4 py-5 text-[14px] leading-6 text-oa-muted-fg">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-oa-border">
      {events.map((event) => {
        const shown = event.items
          .filter((item) => item.ticker || item.name)
          .slice(0, 6);
        return (
          <li
            key={event.id}
            className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 px-4 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_auto]"
          >
            <div
              className="oa-mono pt-0.5 text-[12px] leading-5 text-oa-muted-fg"
              title={`Filed ${fmtDate(event.date)}`}
            >
              {fmtDate(event.date, false)}
            </div>
            <div className="min-w-0">
              {showName ? (
                <p className="flex min-w-0 items-center gap-1.5 text-[14px] leading-5">
                  <PartyDot party={event.party} />
                  <a
                    href={sourceHref(event.source_id)}
                    className="truncate font-medium text-oa-fg outline-none hover:text-oa-primary focus-visible:text-oa-primary"
                  >
                    {event.name}
                  </a>
                  <span className="hidden shrink-0 truncate text-[12px] text-oa-muted-fg sm:inline">
                    {event.person}
                  </span>
                </p>
              ) : null}
              {shown.length > 0 ? (
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {shown.map((item, index) => (
                    <MoveItem
                      key={`${item.action}-${item.ticker ?? item.name}-${index}`}
                      item={item}
                    />
                  ))}
                </p>
              ) : (
                <p className="mt-0.5 text-[13px] leading-5 text-oa-muted-fg">
                  {event.kind === "fund" && !event.items.length
                    ? "First filing on record, nothing to compare yet."
                    : event.headline}
                </p>
              )}
              <p className="mt-0.5 text-[11.5px] leading-4 text-oa-muted-fg">
                {timing(event)}
              </p>
            </div>
            <div className="col-start-2 mt-1 text-[11.5px] text-oa-muted-fg sm:col-start-3 sm:mt-0.5 sm:text-right">
              <ExternalLink href={event.url}>
                {event.kind === "fund" ? "This report at the SEC" : "Report (PDF)"}
              </ExternalLink>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
