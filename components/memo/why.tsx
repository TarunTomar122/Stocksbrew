"use client";

import Link from "next/link";
import * as React from "react";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

type LinkTo = { label: string; href: string };

/**
 * A card's footer: its one action on the left, a "Why" toggle on the right.
 * The toggle opens the memo's full sentence, its source and the page with
 * the evidence, under the footer. Closed by default.
 */
export function WhyFoot({
  action,
  text,
  source,
  evidence,
  about,
}: {
  action: LinkTo | null;
  text: string;
  source: string;
  evidence: LinkTo | null;
  /** What the card says, so each "Why" button has its own name for a screen reader: "Why: 56% in Technology…". */
  about: string;
}) {
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  return (
    <div className="mt-auto pt-3">
      <div className="flex items-center justify-between gap-3 border-t border-oa-border pt-2 text-[13px] leading-5">
        {action ? (
          <Link href={action.href} prefetch={false} className={`min-w-0 rounded font-medium text-oa-primary underline-offset-2 hover:underline ${FOCUS}`}>
            {action.label}&nbsp;→
          </Link>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Why: ${about}`}
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex shrink-0 items-center gap-1 rounded px-1 text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}
        >
          Why
          <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div id={panelId} hidden={!open} className="pt-2">
        <p className="text-pretty text-[13.5px] leading-5 text-oa-fg">{text}</p>
        <p className="mt-1 text-[12px] leading-4 text-oa-muted-fg">
          {source}
          {evidence ? (
            <>
              {" · "}
              <Link href={evidence.href} prefetch={false} className="font-medium text-oa-primary underline-offset-2 hover:underline">
                {evidence.label}
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
