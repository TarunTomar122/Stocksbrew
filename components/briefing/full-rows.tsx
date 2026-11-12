"use client";

import * as React from "react";

/**
 * A card grid that only ever shows whole rows (judges, Nov 12: no conspicuous gaps at the end of a row). At each
 * screen size the cards past the last full row fold behind one quiet "Show N more" under the grid; open, every card
 * shows. The columns come from the caller (equal columns that fill the width); the cut is plain CSS, written on the
 * server, so the first paint is already folded and nothing jumps when the script loads.
 */

/** Tailwind's breakpoints for sm, lg and 2xl. */
const SIZES = [
  { key: "sm", min: 640 },
  { key: "lg", min: 1024 },
  { key: "xxl", min: 1536 },
] as const;

export type RowColumns = { sm: number; lg: number; xxl: number };

/** How many cards show at `columns` across: all of them when they make whole rows (or less than one row). */
export function wholeRows(count: number, columns: number): number {
  if (columns <= 1 || count <= columns) return count;
  return Math.floor(count / columns) * columns;
}

export function FullRows({ count, columns, label, className, children }: { count: number; columns: RowColumns; label: string; className: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const id = `rows-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shown = { sm: wholeRows(count, columns.sm), lg: wholeRows(count, columns.lg), xxl: wholeRows(count, columns.xxl) };
  const more = { sm: count - shown.sm, lg: count - shown.lg, xxl: count - shown.xxl };
  const folds = more.sm > 0 || more.lg > 0 || more.xxl > 0;
  // Each size resets the one before it (at the same specificity as the hiding rule), then hides past its own cut.
  const css = SIZES.map(
    ({ key, min }) => `@media (min-width:${min}px){#${id}>li:nth-child(n){display:revert}${more[key] > 0 ? `#${id}>li:nth-child(n+${shown[key] + 1}){display:none}` : ""}}`,
  ).join("");
  return (
    <div className="min-w-0">
      {/* Raw CSS, so the server and the browser write the same characters (">" would be escaped as text). */}
      {folds && !open ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <ul id={id} aria-label={label} className={className}>
        {children}
      </ul>
      {folds ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className={`mt-2 hidden h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${
            more.sm > 0 ? "sm:flex" : "sm:hidden"
          } ${more.lg > 0 ? "lg:flex" : "lg:hidden"} ${more.xxl > 0 ? "2xl:flex" : "2xl:hidden"}`}
        >
          {open ? (
            "Show less"
          ) : (
            <>
              <span className="lg:hidden">Show {more.sm} more</span>
              <span className="hidden lg:inline 2xl:hidden">Show {more.lg} more</span>
              <span className="hidden 2xl:inline">Show {more.xxl} more</span>
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
