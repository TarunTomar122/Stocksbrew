"use client";

import type { StockTimelineItem } from "@/lib/stock-timeline";

import { EarlierTimeline } from "./earlier-timeline";
import { Missing } from "./primitives";
import { TimelineRow } from "./timeline-row";

/** How many entries show before the fold; the rest of what the server sends (below.tsx caps it) is folded. */
const FIRST = 7;

/**
 * The "What changed" list: the latest entries, then the older ones folded
 * (earlier-timeline.tsx). Drawn from the items as data, so the rows' markup
 * is in the page once, not again in the data React reads it from.
 */
export function ChangedTimeline({ items, nowIso, ticker }: { items: StockTimelineItem[]; nowIso: string; ticker: string }) {
  const first = items.slice(0, FIRST);
  const rest = items.slice(FIRST);
  if (!first.length) return <Missing>Nothing new on {ticker} yet.</Missing>;
  return (
    <>
      <ol>
        {first.map((item) => (
          <TimelineRow key={item.id} item={item} nowIso={nowIso} />
        ))}
      </ol>
      {rest.length ? <EarlierTimeline items={rest} nowIso={nowIso} ticker={ticker} /> : null}
    </>
  );
}
