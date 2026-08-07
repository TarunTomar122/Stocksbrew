import Link from "next/link";
import type { ReactNode } from "react";

export type CommandHeaderProps = {
  greeting?: string;
  dateLabel?: string;
  statusLine?: string;
  trackedCount: number;
  isSubscribed: boolean;
  mode?: "live" | "sample";
  actions?: ReactNode;
};

export function CommandHeader({
  trackedCount,
  isSubscribed,
  mode = "live",
  actions,
}: CommandHeaderProps) {
  return (
    <header className="border-b border-[var(--rn-line)] pb-6 pt-3 sm:pb-8 sm:pt-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight text-[var(--rn-ink)] sm:text-[32px]">
          Your watchlist
        </h1>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          {!isSubscribed && mode === "live" ? (
            <Link
              href="/subscribe"
              className="rounded-full px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--rn-muted)] no-underline shadow-[inset_0_0_0_1px_var(--rn-line)] transition-colors hover:text-[var(--rn-ink)]"
            >
              Free · {trackedCount}/3
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
