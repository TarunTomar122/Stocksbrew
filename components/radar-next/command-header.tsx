import Link from "next/link";
import type { ReactNode } from "react";

export type CommandHeaderProps = {
  greeting: string;
  dateLabel: string;
  statusLine: string;
  trackedCount: number;
  isSubscribed: boolean;
  mode?: "live" | "sample";
  actions?: ReactNode;
};

export function CommandHeader({
  greeting,
  dateLabel,
  statusLine,
  trackedCount,
  isSubscribed,
  mode = "live",
  actions,
}: CommandHeaderProps) {
  return (
    <header className="border-b border-[var(--rn-line)] pb-6 pt-3 sm:pb-8 sm:pt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rn-kick">Watchlist</span>
        <span className="text-[var(--rn-line)]" aria-hidden>
          /
        </span>
        <span
          className={`flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${
            mode === "live" ? "text-[var(--rn-bull)]" : "text-[var(--rn-muted)]"
          }`}
        >
          <span className="rn-pulse" aria-hidden />
          {mode === "live" ? "live" : "illustrative sample"}
        </span>
        <span className="ml-auto font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--rn-muted)]">
          {dateLabel}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-5 sm:mt-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl min-w-0">
          <h1 className="text-[34px] font-extrabold leading-[0.98] tracking-[-0.045em] text-[var(--rn-ink)] sm:text-[48px]">
            Your stocks, sorted by what matters.
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--rn-muted)] sm:text-[15px]">
            <span className="font-semibold text-[var(--rn-ink)]">{greeting}.</span> {statusLine}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          {isSubscribed ? (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--rn-bull)_12%,transparent)] px-2.5 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--rn-bull)]">
              Pro · {trackedCount} tracked
            </span>
          ) : mode === "live" ? (
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
