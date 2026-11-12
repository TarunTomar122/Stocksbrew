"use client";

import * as React from "react";

/**
 * The log's rows inside a rail box of fixed height (`fit`; `box` names it, the briefing's `[data-rail-log]` by default,
 * My stocks' memo box too, whose cards sit two across): the list is cut to the whole rows that fit, so the box
 * never ends halfway through a row (owner rule 5). The rest scroll inside. Only on a wide screen, where the rail has
 * that fixed height (the `[data-rail-log]` box); elsewhere the list is its natural height.
 */
export function FitRows({ className, box: boxSelector = "[data-rail-log]", children }: { className: string; box?: string; children: React.ReactNode }) {
  const list = React.useRef<HTMLOListElement>(null);
  const [max, setMax] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const node = list.current;
    const box = node?.closest<HTMLElement>(boxSelector);
    if (!node || !box) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      if (!wide.matches) {
        setMax(null);
        return;
      }
      // The room the list has: the box, less everything in the card above the list (its header and border).
      const top = node.getBoundingClientRect().top - box.getBoundingClientRect().top;
      // Less what the card keeps under the list (its bottom padding and borders), so the last row is never cut by it.
      let below = 0;
      for (let el = node.parentElement; el && el !== box; el = el.parentElement) {
        const style = getComputedStyle(el);
        below += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      }
      const room = box.clientHeight - top - below;
      // Each row's bottom edge inside the list (its top border included), so a grid of cards side by side is cut on
      // whole rows too, with the gaps between them counted. A row hidden at this width (display: none, e.g. the
      // example's Agents row, a phone's only) has no box and is left out, or its zero rect would count as a bottom.
      const listTop = node.getBoundingClientRect().top - node.scrollTop;
      const bottoms = (Array.from(node.children) as HTMLElement[])
        .filter((row) => row.getClientRects().length > 0)
        .map((row) => row.getBoundingClientRect().bottom - listTop);
      if (bottoms.length === 0) {
        setMax(null);
        return;
      }
      const all = Math.max(...bottoms);
      const used = Math.max(0, ...bottoms.filter((bottom) => bottom <= room + 0.5));
      // At least one whole row, and no limit when every row fits.
      setMax(all <= room + 0.5 ? null : Math.max(used, bottoms[0]!));
    };
    measure();
    // The box, and each row: a late web font can change a row's height without the box changing.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    for (const row of Array.from(node.children)) observer.observe(row);
    wide.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", measure);
    };
  }, [boxSelector]);

  return (
    <ol ref={list} className={className} style={max !== null ? { maxHeight: max } : undefined}>
      {children}
    </ol>
  );
}
