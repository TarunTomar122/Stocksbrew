"use client";

import * as React from "react";

/**
 * Two server-rendered versions of one panel body, the short one first, and one quiet "Show N more" under it (the
 * heatmap past its twelve heaviest names). Nothing scrolls inside the card; the page grows instead.
 */
export function Fold({ short, long, more }: { short: React.ReactNode; long: React.ReactNode; more: number }) {
  const [open, setOpen] = React.useState(false);
  if (more <= 0) return <>{long}</>;
  return (
    <>
      {open ? long : short}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-2 flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      >
        {open ? "Show less" : `Show ${more} more`}
      </button>
    </>
  );
}
