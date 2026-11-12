"use client";

import * as React from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * The compare table's scroll box, ending on a whole row (owner rule 5): its height comes down from the CSS cap to the
 * bottom of the last body row that fits under it, so no row is cut in half. Rows wrap to different heights (the
 * "Why" row), so they are measured; a width change measures again. Without script the CSS cap still holds.
 */
export function WholeRowsBox({ className, children }: { className: string; children: React.ReactNode }) {
  const box = React.useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => {
      node.style.maxHeight = "";
      const cap = Number.parseFloat(window.getComputedStyle(node).maxHeight);
      if (!Number.isFinite(cap) || node.scrollHeight <= cap + 0.5) return;
      const top = node.getBoundingClientRect().top - node.scrollTop;
      let bottom = 0;
      for (const row of Array.from(node.querySelectorAll("tbody > tr")) as HTMLElement[]) {
        const end = row.getBoundingClientRect().bottom - top;
        if (end > cap + 0.5) break;
        bottom = end;
      }
      if (bottom > 0) node.style.maxHeight = `${Math.ceil(bottom)}px`;
    };
    fit();
    const table = node.firstElementChild;
    const observer = new ResizeObserver(fit);
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className={className}>
      {children}
    </div>
  );
}
