"use client";

import * as React from "react";

/**
 * One "Show N more" for several short lists side by side (owner rule 1: never the same button under every card). The
 * lists are the server's own `<ul className="oa-fold-rows">`, all rows rendered; while folded, CSS hides each list's
 * rows past the sixth (money.tsx FOLD_ROWS), so the first paint is already folded. The wrapper is `display: contents`, so the cards stay
 * children of the module's grid, and the button spans the whole row under them.
 */
export function RowsFold({ more, children }: { more: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  if (more <= 0) return <>{children}</>;
  return (
    <div className={`contents ${open ? "" : "[&_.oa-fold-rows>li:nth-child(n+7)]:hidden"}`}>
      {children}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="col-span-full flex h-9 w-full items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg outline-none transition-colors hover:bg-oa-accent hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      >
        {open ? "Show less" : `Show ${more} more`}
      </button>
    </div>
  );
}
