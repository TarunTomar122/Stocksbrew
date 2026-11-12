"use client";

import * as React from "react";

/**
 * True while a scroll box with no visible bar (owner rule 5) has more rows below what it shows, so its bottom edge
 * can fade and say "there is more" without a scrollbar or a "Show more" button. `watch` is whatever changes the rows
 * (their count, a filter), so the box is checked again when they do.
 */
export function useMoreBelow(ref: React.RefObject<HTMLElement | null>, watch: unknown): boolean {
  const [more, setMore] = React.useState(false);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) {
      setMore(false);
      return;
    }
    // A few pixels of slack: a box fitted to whole rows can end a fraction short of its last row.
    const check = () => setMore(node.scrollTop + node.clientHeight < node.scrollHeight - 4);
    check();
    node.addEventListener("scroll", check, { passive: true });
    // The box is fitted to whole rows after layout, and late fonts change row heights: both resize it.
    const observer = new ResizeObserver(check);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener("scroll", check);
      observer.disconnect();
    };
  }, [ref, watch]);
  return more;
}

/** The bottom edge fading out, for a box `useMoreBelow` says has more: a mask, so it works on any background and theme. */
export const FADE_BOTTOM: React.CSSProperties = {
  maskImage: "linear-gradient(to bottom, #000 calc(100% - 2.75rem), transparent)",
  WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 2.75rem), transparent)",
};
