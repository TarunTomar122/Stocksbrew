"use client";

import * as React from "react";

/**
 * The holdings grid, cut to whole rows of cards (owner rule 5): every card shows when the list is short, and a long
 * list scrolls inside a box that ends on the last whole row in view, never halfway through a card. About eight cards
 * on a phone (one column), five rows of two side by side; a list only a row or two longer than that shows whole.
 * Rows are read from where the cards sit, so a card that spans the row counts as its own row.
 */
const PHONE_ROWS = 8;
const WIDE_ROWS = 5;

export function FitCards({ id, className, children }: { id?: string; className: string; children: React.ReactNode }) {
  const list = React.useRef<HTMLUListElement>(null);
  const [max, setMax] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const measure = () => {
      const cards = Array.from(node.children) as HTMLElement[];
      const columns = getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const limit = columns > 1 ? WIDE_ROWS : PHONE_ROWS;
      // Each row's top, in order; the cards sit in the list (it is positioned), so offsetTop is from its top.
      const tops = [...new Set(cards.map((card) => card.offsetTop))].sort((a, b) => a - b);
      // One or two rows past the limit show whole: a scroll box hiding just one card reads as a missing card.
      if (tops.length <= limit + 2) {
        setMax(null);
        return;
      }
      const last = tops[limit - 1]!;
      const bottom = Math.max(...cards.filter((card) => card.offsetTop <= last).map((card) => card.offsetTop + card.offsetHeight));
      setMax(bottom);
    };
    measure();
    // The list's width, and each card: a late web font or logo can change a card's height.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const card of Array.from(node.children)) observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <ul ref={list} id={id} className={`relative ${className}`} style={max !== null ? { maxHeight: max } : undefined}>
      {children}
    </ul>
  );
}
