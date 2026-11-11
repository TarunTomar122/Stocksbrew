"use client";

import * as React from "react";

/** Opens or closes every section of the report at once. */
export function ExpandAll({ target }: { target: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <button
      type="button"
      data-testid="research-expand"
      onClick={() => {
        const next = !open;
        document.querySelectorAll<HTMLDetailsElement>(`#${target} details[data-section]`).forEach((node) => {
          node.open = next;
        });
        setOpen(next);
      }}
      className="text-[13px] font-medium text-oa-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {open ? "Close every section" : "Open every section"}
    </button>
  );
}
