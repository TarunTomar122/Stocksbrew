"use client";

import * as React from "react";

/**
 * Progressive disclosure for secondary blocks. On a phone the content waits
 * behind one button that says what is inside ("Show screener, themes and 4
 * more"); from `lg` up there is room, so it is always shown and the button is
 * not. With `always`, it waits on every screen size. The content is rendered
 * either way (only hidden), so links and search engines still see it.
 */
export function ShowMore({
  label,
  less = "Show less",
  always = false,
  fill = false,
  contents = false,
  children,
  className = "",
}: {
  /** What the button says while closed, e.g. "Show 12 more stocks". */
  label: React.ReactNode;
  less?: React.ReactNode;
  always?: boolean;
  /** Inside a CardGrid: stretch to the row's height so cards side by side end at the same line. */
  fill?: boolean;
  /**
   * From `lg` up, its children take part in the parent grid as if the wrapper
   * were not there: one button on a phone for several cards side by side.
   */
  contents?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const hide = open ? "" : always ? "hidden" : "max-lg:hidden";
  return (
    <div className={`${fill ? "lg:h-full" : ""} ${contents && !always ? "lg:contents" : ""} ${className}`}>
      <div id={id} className={`${hide} ${fill && !always ? "lg:h-full" : ""} ${contents && !always ? "lg:contents" : ""}`}>
        {children}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`${always ? "" : "lg:hidden"} mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-oa-border bg-oa-card px-4 text-[14px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]`}
      >
        {open ? less : label}
        <span aria-hidden="true" className={`text-oa-muted-fg transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
    </div>
  );
}
