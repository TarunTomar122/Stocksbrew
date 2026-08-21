"use client";

import * as React from "react";

/**
 * Plain disclosure rows with the measured-height choreography: the panel is
 * a CSS grid whose rows animate 0fr to 1fr, so the height eases to whatever
 * the content needs. No measurement, no accordion library.
 */
export function Disclosure({
  question,
  children,
  defaultOpen = false,
}: {
  question: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const panelId = React.useId();
  const buttonId = React.useId();

  return (
    <div className="border-b border-oa-border">
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      >
        <span className="text-[15px] font-medium text-oa-fg">{question}</span>
        <span
          aria-hidden="true"
          className="shrink-0 text-oa-muted-fg transition-transform duration-200 ease-out group-hover:text-oa-fg data-[open=true]:rotate-45"
          data-open={open}
        >
          +
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="pb-4 pr-8 text-sm leading-6 text-oa-muted-fg">{children}</p>
        </div>
      </div>
    </div>
  );
}
