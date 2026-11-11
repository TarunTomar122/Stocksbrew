import Link from "next/link";

import { firstFullSentence } from "@/lib/plain-copy";
import type { MemoHistoryRow } from "@/lib/memo/store";
import { shortDay, weekTitle } from "@/lib/memo/week";

/** Every week's memo, newest first, each one tap away. The one on screen is marked. */
export function MemoHistory({ rows, current, latestKey }: { rows: MemoHistoryRow[]; current: string; latestKey: string }) {
  if (rows.length <= 1) return null;
  return (
    <nav aria-label="Earlier memos" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <h2 className="oa-label flex min-h-11 items-center border-b border-oa-border px-4 py-2">Every week</h2>
      <ol className="divide-y divide-oa-border">
        {rows.map((row) => {
          const selected = row.weekKey === current;
          const href = row.weekKey === latestKey ? "/portfolio/memo" : `/portfolio/memo?week=${row.weekKey}`;
          return (
            <li key={row.weekKey}>
              <Link
                href={href}
                aria-current={selected ? "page" : undefined}
                className={`block px-4 py-2.5 transition-colors hover:bg-oa-bg ${selected ? "bg-oa-bg" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`text-[14px] font-medium ${selected ? "text-oa-primary" : "text-oa-fg"}`}>{weekTitle(row)}</span>
                  <span className="oa-mono shrink-0 text-[11.5px] tabular-nums text-oa-muted-fg">
                    {row.complete ? `to ${shortDay(row.friday)}` : "so far"}
                  </span>
                </span>
                <span className="mt-0.5 block text-pretty text-[13px] leading-[19px] text-oa-muted-fg">{firstFullSentence(row.topLine)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
