"use client";

import * as React from "react";

/**
 * A list that scrolls inside a box ending on a whole row, never halfway through one (owner rule 5). The box is about
 * `rem` tall (`wideRem` from the `sm` width up; nothing is cut below `minWidth`): it is cut back to the bottom of the
 * last row that fits, and a list only a little taller than the box shows whole rather than hiding a sliver. Rows are
 * the elements marked `data-row`, or else the items of the first list inside; items side by side in a grid end level,
 * so a row of cards counts as one. The class's own max height (keep it the same as `rem`) holds until the page has
 * measured it.
 */
export function WholeRows({
  rem,
  wideRem,
  minWidth = 0,
  className = "",
  children,
}: {
  /** The most the box may be, in rem. */
  rem: number;
  /** The same from the `sm` width (640px) up, when it differs. */
  wideRem?: number;
  /** From this viewport width up (px); below it the list is not cut. */
  minWidth?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const [max, setMax] = React.useState<number | "none" | null>(null);

  React.useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const active = window.matchMedia(`(min-width: ${minWidth}px)`);
    const wide = window.matchMedia("(min-width: 640px)");
    const measure = () => {
      if (!active.matches) {
        setMax("none");
        return;
      }
      const marked = Array.from(node.querySelectorAll<HTMLElement>("[data-row]"));
      const rows = marked.length ? marked : (Array.from(node.querySelector("ul, ol")?.children ?? []) as HTMLElement[]);
      // Nothing to cut on ("Nothing scheduled"): the class's height stands.
      if (rows.length === 0) {
        setMax(null);
        return;
      }
      const budget = (wide.matches && wideRem ? wideRem : rem) * parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
      const top = node.getBoundingClientRect().top - node.scrollTop;
      const bottoms = rows.map((row) => row.getBoundingClientRect().bottom - top);
      // The tallest row: a list that runs past the box by less than most of one shows whole.
      const tallest = Math.max(...rows.map((row) => row.offsetHeight));
      if (node.scrollHeight <= budget + tallest * 0.75) {
        setMax("none");
        return;
      }
      const fits = bottoms.filter((bottom) => bottom <= budget + 0.5);
      setMax(Math.ceil(fits.length ? Math.max(...fits) : Math.min(...bottoms)));
    };
    measure();
    // Measured a frame later when something resizes, so setting the box's height never feeds back into the observer
    // in the same frame ("ResizeObserver loop completed with undelivered notifications").
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    // The box's width and its list: a late web font or logo can change a row's height.
    const observer = new ResizeObserver(later);
    observer.observe(node);
    const list = node.querySelector("ul, ol");
    if (list) observer.observe(list);
    active.addEventListener("change", later);
    wide.addEventListener("change", later);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      active.removeEventListener("change", later);
      wide.removeEventListener("change", later);
    };
  }, [rem, wideRem, minWidth]);

  return (
    <div ref={box} className={className} style={max === null ? undefined : { maxHeight: max === "none" ? "none" : max }}>
      {children}
    </div>
  );
}
