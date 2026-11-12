"use client";

import * as React from "react";

/**
 * The log's rows inside a rail box of fixed height (`fit`): the list is cut to the whole rows that fit, so the box
 * never ends halfway through a row (owner rule 5). The rest scroll inside. Only on a wide screen, where the rail has
 * that fixed height (the `[data-rail-log]` box); elsewhere the list is its natural height.
 */
export function FitRows({ className, children }: { className: string; children: React.ReactNode }) {
  const list = React.useRef<HTMLOListElement>(null);
  const [max, setMax] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const node = list.current;
    const box = node?.closest<HTMLElement>("[data-rail-log]");
    if (!node || !box) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      if (!wide.matches) {
        setMax(null);
        return;
      }
      // The room the list has: the box, less everything in the card above the list (its header and border).
      const top = node.getBoundingClientRect().top - box.getBoundingClientRect().top;
      const room = box.clientHeight - top - node.clientTop;
      let used = 0;
      for (const row of Array.from(node.children) as HTMLElement[]) {
        if (used + row.offsetHeight > room + 0.5) break;
        used += row.offsetHeight;
      }
      // At least one whole row, and no limit when every row fits.
      const all = Array.from(node.children).reduce((sum, row) => sum + (row as HTMLElement).offsetHeight, 0);
      const first = (node.children[0] as HTMLElement | undefined)?.offsetHeight ?? 0;
      // Border-box sizing: the list's own top border counts toward its height.
      setMax(used >= all ? null : Math.max(used, first) + node.clientTop);
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
  }, []);

  return (
    <ol ref={list} className={className} style={max !== null ? { maxHeight: max } : undefined}>
      {children}
    </ol>
  );
}
