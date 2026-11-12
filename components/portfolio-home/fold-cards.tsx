"use client";

import * as React from "react";

import { CARD_GRID, showAt } from "@/components/portfolio-home/fit";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

const Fold = React.createContext<{ open: boolean; toggle: () => void; id: string } | null>(null);

/**
 * The overview's one grid (./fit.ts): the holdings, the memo and the agents are all its cards. It carries whether the
 * folded holdings are open (`data-open`, read by the cards' `group-data-[open=true]/fold:` classes), so opening them
 * also moves the memo and agents to the plan that keeps the rows full with every holding shown. Never scrolls inside.
 */
export function FoldScope({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const value = React.useMemo(() => ({ open, toggle: () => setOpen((was) => !was), id }), [open, id]);
  return (
    <Fold.Provider value={value}>
      <div id={id} data-open={open} className={`group/fold ${CARD_GRID}`}>
        {children}
      </div>
    </Fold.Provider>
  );
}

/**
 * The holdings' one button (owner, Nov 12: "why show me all when only 6 needs a look"): "Show 5 more" opens the
 * folded cards, "Show fewer" folds them again. How many are folded depends on the cards across, so `rest` has one
 * count per width; the button says the one for the width on screen and is not there where nothing is folded.
 */
export function FoldButton({ rest }: { rest: readonly number[] }) {
  const fold = React.useContext(Fold);
  if (!fold) return null;
  const counts = [...new Set(rest.filter((count) => count > 0))];
  return (
    <button
      type="button"
      aria-expanded={fold.open}
      aria-controls={fold.id}
      onClick={fold.toggle}
      className={`inline-flex h-7 shrink-0 items-center rounded-md border border-oa-border bg-oa-card px-2.5 text-[13px] font-medium leading-5 text-oa-fg transition-colors hover:bg-oa-accent ${FOCUS} ${showAt(rest.map((count) => count > 0), "inline-flex")}`}
    >
      {fold.open
        ? "Show fewer"
        : counts.map((count) => (
            <span key={count} className={counts.length > 1 ? showAt(rest.map((value) => value === count), "inline") : ""}>
              Show {count} more
            </span>
          ))}
    </button>
  );
}
