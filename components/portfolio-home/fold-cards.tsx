"use client";

import * as React from "react";

import { FitCards } from "@/components/portfolio-home/fit-cards";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * The holdings grid with the quiet cards folded away (owner, Nov 12: "why show me all when only 6 needs a look???").
 * The cards that need a look show; the rest (marked `data-rest`, ./stocks.tsx) stay in the same grid, hidden until the
 * one toggle under it opens them. Hidden cards measure as nothing, and FitCards watches every card, so opening or
 * closing the fold re-cuts the scroll box to whole rows.
 */
export function FoldCards({ className, rest, children }: { className: string; rest: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <>
      <FitCards id={id} className={`${className} ${open ? "" : "[&>[data-rest]]:hidden"}`}>
        {children}
      </FitCards>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`mt-2 rounded px-1 text-[13px] leading-5 text-oa-muted-fg transition-colors hover:text-oa-fg ${FOCUS}`}
      >
        {open ? `Hide the other ${rest}` : `${rest} more, nothing urgent`}
      </button>
    </>
  );
}
