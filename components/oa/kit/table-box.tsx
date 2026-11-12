import type * as React from "react";

import { WholeRows } from "@/components/wire/whole-rows";

/**
 * A table that scrolls inside a box about `rows` rows tall (owner rule 5: about eight rows, every row reachable, no
 * visible scrollbar), cut on a whole row (components/wire/whole-rows.tsx measures the body rows), with the header row
 * kept in view while it scrolls. The scroll hands back to the page at either end: no overscroll containment. A short
 * table is its own height. The header sits above body cells that stick to the left (z-10, the markets tables' name
 * column), inside its own stacking context so it never rises over the page's menus.
 */
export function TableBox({
  rows = 8,
  rowRem = 2.5,
  headRem = 2.5,
  head = "bg-oa-card",
  className = "",
  children,
}: {
  /** Whole rows in view before it scrolls. */
  rows?: number;
  /** About one body row's height, in rem. */
  rowRem?: number;
  /** About the header row's height, in rem. */
  headRem?: number;
  /** The header cells' background, opaque so rows scroll under it: the surface the table sits on. */
  head?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const rem = headRem + rows * rowRem;
  return (
    <div style={{ "--table-box": `${rem}rem` } as React.CSSProperties} className="min-w-0">
      <WholeRows
        rem={rem}
        className={`isolate max-h-[var(--table-box)] overflow-auto scrollbar-hide [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-20 ${HEAD_BG[head] ?? head} ${className}`}
      >
        {children}
      </WholeRows>
    </div>
  );
}

// Written out whole so Tailwind finds every class.
const HEAD_BG: Record<string, string> = {
  "bg-oa-card": "[&_thead_th]:bg-oa-card",
  "bg-oa-bg": "[&_thead_th]:bg-oa-bg",
};
