import Link from "next/link";
import * as React from "react";

export type TreemapChip = { key: string; href: string; icon: React.ReactNode; name: string; figure: React.ReactNode; background?: string };

/**
 * The labels under a map for its tiles that are not showing all their words: each one's icon, name and figures as a
 * chip in the tile's own tint, opening what the tile opens. The chips wrap onto as many lines as they need; nothing
 * scrolls sideways or is cut (council, Nov 12).
 */
export function TreemapChips({ chips, dense = false, className = "" }: { chips: readonly TreemapChip[]; dense?: boolean; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <ul className={`flex flex-wrap ${dense ? "gap-1" : "gap-1.5"} ${className}`}>
      {chips.map((chip) => (
        <li key={chip.key} className="min-w-0">
          <Link
            prefetch={false}
            href={chip.href}
            style={chip.background ? { background: chip.background } : undefined}
            className={`inline-flex items-center whitespace-nowrap rounded-md border border-oa-border font-medium text-oa-fg outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oa-ring dark:hover:brightness-110 ${
              dense ? "h-7 gap-1 px-1.5 text-[12px]" : "h-8 gap-1.5 px-2 text-[12.5px]"
            }`}
          >
            <span className="flex shrink-0">{chip.icon}</span>
            {chip.name}
            <span className="oa-mono tabular-nums">{chip.figure}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
