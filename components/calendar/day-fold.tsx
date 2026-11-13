"use client";

import * as React from "react";

// The kit's focus ring, written out: the kit's index pulls in server-only modules a client file cannot import.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * A calendar day's events: the first ones, then the rest behind one quiet "Show N more" (owner rule 4: a card never
 * scrolls inside its own box, where nobody can tell more is there). The rest is in the page either way, only hidden,
 * so links and search engines still see it. Not the kit's ShowMore: that one is a full-width bordered button for a
 * block on a phone, too loud under every column of a week.
 */
export function DayFold({ shown, rest, count }: { shown: React.ReactNode; rest: React.ReactNode; count: number }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const button = React.useRef<HTMLButtonElement>(null);
  const closed = React.useRef(false);
  // Folding a long day back up from far down the page would leave the reader below the column: bring its button back.
  React.useEffect(() => {
    if (open || !closed.current) return;
    closed.current = false;
    const box = button.current?.getBoundingClientRect();
    if (box && box.top < 0) button.current?.scrollIntoView({ block: "center" });
  }, [open]);
  return (
    <>
      {shown}
      {count > 0 ? (
        <>
          <div id={id} hidden={!open}>
            {rest}
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            ref={button}
            onClick={() => {
              if (open) closed.current = true;
              setOpen(!open);
            }}
            className={`flex min-h-10 w-full cursor-pointer items-center px-3 text-left text-[13.5px] font-medium text-oa-primary hover:underline lg:min-h-8 ${FOCUS}`}
          >
            {open ? "Show less" : `Show ${count} more`}
          </button>
        </>
      ) : null}
    </>
  );
}
