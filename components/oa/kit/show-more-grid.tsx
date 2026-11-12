"use client";

import * as React from "react";

/**
 * A card grid that shows its first rows and folds the rest behind one quiet button under it, instead of scrolling
 * inside its own box (owner, Nov 12: an inner scroll "is not obvious" for cards). Tables keep their scroll box.
 *
 * The cards are rendered on the server as the list's own `<li>` children, all of them; while folded, CSS hides the
 * ones past the cut (`:nth-child`), so the first paint is already the folded grid and nothing jumps when the script
 * loads. The cut is per screen size: about three rows wide, fewer on a phone.
 */

/**
 * The cuts, written out whole so Tailwind finds the classes: how many show on a phone, from `sm`, and from `2xl`
 * (never more than from `sm`, so the hiding rules add up). Each cut ends on a whole row of its grid.
 */
const CUTS = {
  /** A 3-column grid that turns 4-column at 2xl: 4 on a phone, three rows of three, then two rows of four. */
  cards: { phone: 4, wide: 9, xxl: 8, hide: "max-sm:[&>li:nth-child(n+5)]:hidden sm:[&>li:nth-child(n+10)]:hidden 2xl:[&>li:nth-child(n+9)]:hidden" },
  /** A 2-column grid (a module beside another): 4 on a phone, four rows of two. */
  pairs: { phone: 4, wide: 8, xxl: 8, hide: "max-sm:[&>li:nth-child(n+5)]:hidden sm:[&>li:nth-child(n+9)]:hidden" },
  /** Small heat tiles: about four rows of three on a phone, three rows of eight wide. */
  tiles: { phone: 12, wide: 24, xxl: 24, hide: "max-sm:[&>li:nth-child(n+13)]:hidden sm:[&>li:nth-child(n+25)]:hidden" },
  /** Rows of a short list inside a card (Analysis's returns): six at every size. */
  rows: { phone: 6, wide: 6, xxl: 6, hide: "[&>li:nth-child(n+7)]:hidden" },
} as const;

export function ShowMoreGrid({
  count,
  cut = "cards",
  label,
  className = "",
  children,
}: {
  /** How many `<li>` children there are. */
  count: number;
  cut?: keyof typeof CUTS;
  /** The list's accessible name. */
  label: string;
  /** The list's own layout classes (a grid and its gaps). */
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const { phone, wide, xxl, hide } = CUTS[cut];
  const morePhone = Math.max(0, count - phone);
  const moreWide = Math.max(0, count - wide);
  const moreXxl = Math.max(0, count - xxl);
  if (morePhone === 0 && moreWide === 0 && moreXxl === 0) {
    return (
      <ul aria-label={label} className={className}>
        {children}
      </ul>
    );
  }
  // The button shows only at the sizes where something is folded (or, once open, where something was).
  const shown = `${morePhone > 0 ? "flex" : "hidden"} ${moreWide > 0 ? "sm:flex" : "sm:hidden"} ${moreXxl > 0 ? "2xl:flex" : "2xl:hidden"}`;
  return (
    <div className="min-w-0">
      <ul id={id} aria-label={label} className={`${className} ${open ? "" : hide}`}>
        {children}
      </ul>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        // Full width and quiet, under the grid.
        className={`mt-2 h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${shown}`}
      >
        {open ? (
          "Show less"
        ) : (
          <>
            <span className="sm:hidden">Show {morePhone} more</span>
            <span className="hidden sm:inline 2xl:hidden">Show {moreWide} more</span>
            <span className="hidden 2xl:inline">Show {moreXxl} more</span>
          </>
        )}
      </button>
    </div>
  );
}
