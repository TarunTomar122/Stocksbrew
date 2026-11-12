"use client";

import { useEffect, useState } from "react";

import type { StockTimelineItem } from "@/lib/stock-timeline";

import { Missing } from "./primitives";
import { TimelineRow } from "./timeline-row";

/** Rows the server draws: about what the box shows before it scrolls. */
const FIRST = 8;

/**
 * The "What changed" list: every entry the server sends (below.tsx caps it),
 * in a box about eight rows tall that scrolls inside, with no fold. The first
 * rows are in the page's HTML; the rest are drawn in the browser once the
 * page is idle, so the page does not send forty rows of markup up front.
 * Drawn from the items as data, so the rows' markup is in the page once.
 */
export function ChangedTimeline({ items, nowIso, ticker }: { items: StockTimelineItem[]; nowIso: string; ticker: string }) {
  const [drawn, setDrawn] = useState(items.length <= FIRST);
  useEffect(() => {
    if (drawn) return;
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setDrawn(true), { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setDrawn(true), 800);
    return () => window.clearTimeout(id);
  }, [drawn]);
  if (!items.length) return <Missing>Nothing new on {ticker} yet.</Missing>;
  const shown = drawn ? items : items.slice(0, FIRST);
  return (
    <ol
      aria-label={`What changed on ${ticker}, newest first`}
      // Draw the rest the moment someone scrolls the box, in case the browser never goes idle.
      onScroll={drawn ? undefined : () => setDrawn(true)}
      tabIndex={0}
      className="scrollbar-hide max-h-[34rem] overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-oa-border sm:max-h-[19.5rem]"
    >
      {shown.map((item) => (
        <TimelineRow key={item.id} item={item} nowIso={nowIso} />
      ))}
    </ol>
  );
}
