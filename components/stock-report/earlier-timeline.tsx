"use client";

import { useEffect, useState } from "react";

import type { StockTimelineItem } from "@/lib/stock-timeline";

import { Details } from "./primitives";
import { TimelineRow } from "./timeline-row";

/**
 * The older "What changed" entries, folded. Their rows are drawn in the
 * browser once the page is idle (or the moment the fold is opened), so the
 * page does not send their markup up front: thirty-odd rows were about 40 KB
 * of every stock page, for a list most readers never open. Open, it is the
 * same list as before.
 */
export function EarlierTimeline({ items, nowIso, ticker }: { items: StockTimelineItem[]; nowIso: string; ticker: string }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setDrawn(true), { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setDrawn(true), 1500);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <Details
      className="border-t border-oa-border"
      track={{ section: "timeline", ticker }}
      summary={`${items.length} earlier ${items.length === 1 ? "entry" : "entries"}`}
      onToggle={(open) => {
        if (open) setDrawn(true);
      }}
    >
      {drawn ? (
        <ol>
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} nowIso={nowIso} />
          ))}
        </ol>
      ) : null}
    </Details>
  );
}
