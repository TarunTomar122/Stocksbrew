"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import { createPortal } from "react-dom";

import { KindIcon } from "@/components/oa/nav-icon";

// The sheet's code loads on the first tap, so the page it sits on stays light (owner rule 11).
const RecipeSheet = dynamic(() => import("./recipe-sheet").then((mod) => mod.RecipeSheet), { ssr: false });

/**
 * The one way into agent recipes on a page: a quiet action beside the page's own primary button (owner rule 4: one
 * primary per header), opening the recipe sheet for this page's subject.
 */
export function RecipeEntry({
  subject,
  label,
  short,
  className = "",
}: {
  /** "stock:NVDA", "fund:berkshire-hathaway", "congress:nancy-pelosi", "basket:<id>". */
  subject: string;
  label: string;
  /** A shorter label for phones. */
  short?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);
  // The sheet is fixed to the viewport: it mounts at the page's root (where the design tokens live), clear of any
  // header box that could clip or offset it.
  const root = open ? (button.current?.closest(".oa-landing, .oa-app") as HTMLElement | null) ?? document.body : null;
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-recipe-entry=""
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 text-[13.5px] font-medium text-oa-primary outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--oa-primary)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${className}`}
      >
        <KindIcon name="alerts" className="size-4" />
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </button>
      {open && root ? createPortal(<RecipeSheet subject={subject} onClose={() => setOpen(false)} />, root) : null}
    </>
  );
}
