"use client";

import * as React from "react";

/**
 * The read's "show more" button. The cards stay in one server-rendered list
 * (so they share a row on a wide screen); the ones past the fold carry
 * `group-data-[open=false]/fold:` classes that hide them until this opens.
 * With `always` the button shows on every screen, otherwise only below `lg`.
 */
export function ReadFold({ always, label, children }: { always: boolean; label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  return (
    <div data-open={open ? "true" : "false"} className="group/fold">
      <div id={id}>{children}</div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`${always ? "" : "lg:hidden"} mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-oa-border bg-oa-card px-4 text-[14px] font-medium text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]`}
      >
        {open ? "Show less" : label}
        <span aria-hidden="true" className={`text-oa-muted-fg transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
    </div>
  );
}
