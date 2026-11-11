import type * as React from "react";

/** A markets section's heading: an uppercase label, with an optional note on the right. No hooks: server or client. */
export function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3 px-2 sm:px-0">
      <h2 className="oa-label">{children}</h2>
      {aside ? <span className="text-[12.5px] text-oa-muted-fg">{aside}</span> : null}
    </div>
  );
}
