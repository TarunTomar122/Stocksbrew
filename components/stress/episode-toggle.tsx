"use client";

import * as React from "react";

/**
 * One episode row: the summary is a button that opens the per-holding moves
 * under it. Both parts are rendered on the server and passed in.
 */
export function EpisodeToggle({
  id,
  summary,
  children,
  defaultOpen = false,
}: {
  id: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = `stress-${id}-moves`;
  return (
    <li className="border-b border-oa-border last:border-b-0" data-episode={id} data-open={open}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="group relative block w-full cursor-pointer px-4 py-3 text-left outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--oa-bg)_60%,transparent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] sm:px-5"
      >
        {summary}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-3.5 text-[15px] leading-none text-oa-muted-fg transition-transform duration-200 group-hover:text-oa-fg sm:right-4 ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      <div id={panelId} hidden={!open} className="border-t border-oa-border bg-[color-mix(in_srgb,var(--oa-bg)_50%,transparent)] px-4 pb-4 pt-3 sm:px-5">
        {children}
      </div>
    </li>
  );
}
