"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FADE_BOTTOM, useMoreBelow } from "@/components/follow/use-more-below";
import type { StockTimelineItem } from "@/lib/stock-timeline";

import { Missing } from "./primitives";
import { TimelineRow } from "./timeline-row";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  const list = useRef<HTMLOListElement>(null);
  const shown = drawn ? items : items.slice(0, FIRST);
  // The box ends on a whole row, never through one (owner rule 5): its height comes down from the CSS cap to the
  // bottom of the last row that fits under it. Headlines wrap to different heights, so the rows are measured.
  useIsoLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const fit = () => {
      node.style.maxHeight = "";
      const cap = Number.parseFloat(window.getComputedStyle(node).maxHeight);
      if (!Number.isFinite(cap) || node.scrollHeight <= cap) return;
      let bottom = 0;
      for (const row of Array.from(node.children) as HTMLElement[]) {
        const end = row.offsetTop + row.offsetHeight;
        if (end > cap + 0.5) break;
        bottom = end;
      }
      if (bottom > 0) node.style.maxHeight = `${bottom}px`;
    };
    fit();
    // A width change, or a late web font rewrapping a headline, measures again.
    const observer = new ResizeObserver(fit);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    // Only a change of width: a phone's toolbar hiding fires resize too, and refitting then would nudge the scroll.
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      fit();
    };
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [shown.length]);
  // The bottom edge fades while more rows sit below: the inner scroll has no bar to say so (owner rule 5).
  const more = useMoreBelow(list, shown.length);
  if (!items.length) return <Missing>Nothing new on {ticker} yet.</Missing>;
  return (
    <ol
      ref={list}
      aria-label={`What changed on ${ticker}, newest first`}
      // Draw the rest the moment someone scrolls the box, in case the browser never goes idle.
      onScroll={drawn ? undefined : () => setDrawn(true)}
      tabIndex={0}
      className="scrollbar-hide relative max-h-[34rem] overflow-y-auto overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-oa-border sm:max-h-[19.5rem]"
      style={more ? FADE_BOTTOM : undefined}
    >
      {shown.map((item) => (
        <TimelineRow key={item.id} item={item} nowIso={nowIso} />
      ))}
    </ol>
  );
}
