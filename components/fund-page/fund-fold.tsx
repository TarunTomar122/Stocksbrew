"use client";

import * as React from "react";

/**
 * The fund's holdings and sectors side by side, each showing its first whole rows, with ONE quiet "Show all" under
 * both that opens both lists (judges, ship 71: the two panels were cut mid-row). The rows are all in the server's
 * HTML; while folded, CSS hides each list's rows past the cut (`ul[data-fold] > li:nth-child(n+8)`), so the first
 * paint is already the folded view and nothing jumps when the script loads.
 */
export function FundFold({ hidden, label, className = "", children }: { hidden: number; label: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div id={id} className={`${className} ${open || hidden === 0 ? "" : "[&_ul[data-fold]>li:nth-child(n+8)]:hidden"}`}>
        {children}
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          data-fund-fold=""
          onClick={() => setOpen((value) => !value)}
          className="flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        >
          {open ? "Show less" : label}
        </button>
      ) : null}
    </div>
  );
}
