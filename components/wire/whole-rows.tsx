"use client";

import * as React from "react";

/**
 * A list that scrolls inside a box ending on a whole row, never halfway through one (owner rule 5). The box is about
 * `rem` tall (`wideRem` from `wideFrom`, the `sm` width by default, up; nothing is cut below `minWidth`): it is cut back to the bottom of the
 * last row that fits, and a list only a little taller than the box shows whole rather than hiding a sliver. Rows are
 * the elements marked `data-row`, or else the items of the first list inside, or else a table's body rows; items side by side in a grid end level,
 * so a row of cards counts as one. The class's own max height (keep it the same as `rem`) holds until the page has
 * measured it. With `cue`, the box's last row fades out while more rows wait below it, so a list that scrolls inside
 * says so without a scrollbar; the fade goes once the list is scrolled to its end. A footer that sticks to the box's
 * bottom (marked `data-sticky-foot`, a table's Total row) is kept clear of: the rows above it still end whole.
 */
export function WholeRows({
  rem,
  wideRem,
  wideFrom = 640,
  minWidth = 0,
  cue = false,
  className = "",
  children,
}: {
  /** The most the box may be, in rem. */
  rem: number;
  /** The same from `wideFrom` up, when it differs. */
  wideRem?: number;
  /** Where `wideRem` starts, in px: the `sm` width (640) unless a list changes shape later (two columns from `lg`). */
  wideFrom?: number;
  /** From this viewport width up (px); below it the list is not cut. */
  minWidth?: number;
  /** Fade the bottom edge while rows are hidden below it. */
  cue?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const [max, setMax] = React.useState<number | "none" | null>(null);
  const [more, setMore] = React.useState(false);

  // Rows hidden below the box: checked on scroll and whenever the box's height is set.
  const look = React.useCallback(() => {
    const node = box.current;
    if (!cue || !node) return;
    setMore(node.scrollHeight - node.scrollTop - node.clientHeight > 4);
  }, [cue]);

  // After every render, once the box has its height: cheap, and never left stale by a measure that ran before it.
  React.useLayoutEffect(() => {
    look();
  });

  React.useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const active = window.matchMedia(`(min-width: ${minWidth}px)`);
    const wide = window.matchMedia(`(min-width: ${wideFrom}px)`);
    const measure = () => {
      if (!active.matches) {
        setMax("none");
        return;
      }
      const marked = Array.from(node.querySelectorAll<HTMLElement>("[data-row]"));
      const listed = Array.from(node.querySelector("ul, ol")?.children ?? []) as HTMLElement[];
      // A table's body rows when there is no list (components/oa/kit/table-box.tsx).
      const rows = marked.length ? marked : listed.length ? listed : Array.from(node.querySelectorAll<HTMLElement>("tbody > tr"));
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
      // A sticky footer covers the bottom of the box, so the cut leaves room for it under the last whole row.
      const foot = node.querySelector<HTMLElement>("[data-sticky-foot]")?.offsetHeight ?? 0;
      const fits = bottoms.filter((bottom) => bottom <= budget - foot + 0.5);
      setMax(Math.ceil((fits.length ? Math.max(...fits) : Math.min(...bottoms)) + foot));
    };
    measure();
    // Measured a frame later when something resizes, so setting the box's height never feeds back into the observer
    // in the same frame ("ResizeObserver loop completed with undelivered notifications").
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measure();
        // More rows can arrive with the box's height unchanged ("More companies"): look again.
        look();
      });
    };
    // The box's width and its list: a late web font or logo can change a row's height.
    const observer = new ResizeObserver(later);
    observer.observe(node);
    const list = node.querySelector("ul, ol");
    if (list) observer.observe(list);
    // Its own content too, when the list sits inside other markup (a grid of cards, a stream of days).
    if (node.firstElementChild && node.firstElementChild !== list) observer.observe(node.firstElementChild);
    active.addEventListener("change", later);
    wide.addEventListener("change", later);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      active.removeEventListener("change", later);
      wide.removeEventListener("change", later);
    };
  }, [rem, wideRem, wideFrom, minWidth, look]);

  const fade = cue && more ? "linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent)" : undefined;
  const style: React.CSSProperties = {
    ...(max === null ? {} : { maxHeight: max === "none" ? "none" : max }),
    ...(fade ? { maskImage: fade, WebkitMaskImage: fade } : {}),
  };
  return (
    <div ref={box} className={className} style={style} onScroll={cue ? look : undefined}>
      {children}
    </div>
  );
}
