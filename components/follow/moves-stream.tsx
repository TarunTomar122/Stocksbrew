import { MovesList, type MoveLine, type MoveRow } from "@/components/follow/moves-list";
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

function moveLine(item: ActivityItem): MoveLine | null {
  const name = item.ticker ? null : (item.name ?? "").split(" ").slice(0, 4).join(" ");
  if (!item.ticker && !name) return null;
  return { label: actionLabel(item.action), up: actionTone(item.action) === "up", ticker: item.ticker, name, size: activitySize(item) };
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

/**
 * What was just filed, newest first: who, what, how big, and filed when against traded when.
 * The words are worked out here, on the server; the list itself (moves-list.tsx) gets only them.
 */
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
  const rows = events.map((event): MoveRow => ({
    id: event.id,
    day: fmtDate(event.date, false),
    dayLong: fmtDate(event.date),
    href: sourceHref(event.source_id),
    name: event.name,
    person: event.person,
    ...(event.party ? { party: event.party } : {}),
    items: event.items
      .filter((item) => item.ticker || item.name)
      .slice(0, 6)
      .map(moveLine)
      .filter((line): line is MoveLine => line !== null),
    note: event.kind === "fund" && !event.items.length ? "First filing on record, nothing to compare yet." : event.headline,
    timing: timing(event),
    url: event.url || null,
    fund: event.kind === "fund",
  }));
  return <MovesList rows={rows} showName={showName} />;
}
