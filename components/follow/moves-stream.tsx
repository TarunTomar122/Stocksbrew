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
import { hasStockPage, stockPagesAmong, type StockPageSet } from "@/lib/stock-page-set";

function moveLine(item: ActivityItem, pages: StockPageSet): MoveLine | null {
  const name = item.ticker ? null : (item.name ?? "").split(" ").slice(0, 4).join(" ");
  if (!item.ticker && !name) return null;
  const line: MoveLine = { label: actionLabel(item.action), up: actionTone(item.action) === "up", ticker: item.ticker, name, size: activitySize(item) };
  if (item.ticker && !hasStockPage(pages, item.ticker)) line.plain = true;
  return line;
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
export async function MovesStream({
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
  const kept = events.map((event) => event.items.filter((item) => item.ticker || item.name).slice(0, 6));
  // Only tickers we hold a page for are links; the rest would be 404s (lib/stock-page-set.ts).
  const pages = await stockPagesAmong(kept.flat().map((item) => item.ticker));
  const rows = events.map((event, index): MoveRow => ({
    id: event.id,
    day: fmtDate(event.date, false),
    dayLong: fmtDate(event.date),
    href: sourceHref(event.source_id),
    name: event.name,
    person: event.person,
    ...(event.party ? { party: event.party } : {}),
    items: kept[index]!
      .map((item) => moveLine(item, pages))
      .filter((line): line is MoveLine => line !== null),
    note: event.kind === "fund" && !event.items.length ? "First filing on record, nothing to compare yet." : event.headline,
    timing: timing(event),
    url: event.url || null,
    fund: event.kind === "fund",
  }));
  return <MovesList rows={rows} showName={showName} />;
}
