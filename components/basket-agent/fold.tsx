"use client";

import * as React from "react";

import type { Fold } from "./parts";

/**
 * The card grid with one quiet "Show N more" under it (owner rule 4: about eight cards, then the page scrolls on). The
 * cards past the fold carry `foldClass`; opening sets `data-open` and they all show. N is counted for the width the
 * grid has, so it always matches what is hidden.
 */
export function Folded({
  fold,
  children,
}: {
  fold: Fold;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const hidden = {
    one: fold.total - fold.one,
    two: fold.total - fold.two,
    three: fold.total - fold.three,
  };
  if (hidden.one + hidden.two + hidden.three === 0) return <>{children}</>;
  const visible = (count: number) => (count > 0 ? "flex" : "hidden");
  return (
    <div className="group/fold [container-type:inline-size]" data-open={open}>
      {children}
      <div
        className={`mt-2 justify-center ${visible(hidden.one)} ${hidden.two > 0 ? "[@container(min-width:34rem)]:flex" : "[@container(min-width:34rem)]:hidden"} ${fold.cols === 3 ? (hidden.three > 0 ? "[@container(min-width:52rem)]:flex" : "[@container(min-width:52rem)]:hidden") : ""}`}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
        >
          {open ? (
            "Show fewer"
          ) : (
            <>
              <span className="inline [@container(min-width:34rem)]:hidden">
                Show {hidden.one} more
              </span>
              <span
                className={`hidden [@container(min-width:34rem)]:inline ${fold.cols === 3 ? "[@container(min-width:52rem)]:hidden" : ""}`}
              >
                Show {hidden.two} more
              </span>
              <span
                className={`hidden ${fold.cols === 3 ? "[@container(min-width:52rem)]:inline" : ""}`}
              >
                Show {hidden.three} more
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
