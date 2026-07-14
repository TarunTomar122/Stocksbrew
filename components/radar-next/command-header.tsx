import Link from "next/link";

export type CommandHeaderProps = {
  greeting: string;
  dateLabel: string;
  statusLine: string;
  trackedCount: number;
  isSubscribed: boolean;
};

export function CommandHeader({
  greeting,
  dateLabel,
  statusLine,
  trackedCount,
  isSubscribed,
}: CommandHeaderProps) {
  return (
    <section className="rn-window rn-scan">
      <div className="rn-chrome flex items-center justify-between gap-2 px-2.5 py-2 font-mono text-[12px] sm:px-4 sm:py-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex items-center gap-1.5" aria-hidden>
            <span className="rn-light rn-light--r" />
            <span className="rn-light rn-light--y" />
            <span className="rn-light rn-light--g" />
          </span>
          <span className="ml-1 truncate text-[var(--rn-muted)] sm:ml-3">sb://radar</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-[var(--rn-bull)]">
          <span className="rn-pulse" aria-hidden />
          LIVE
        </span>
      </div>

      <div className="px-2.5 pt-6 pb-4 sm:px-7 sm:pt-10 sm:pb-8">
        <div className="font-mono text-[11px] text-[var(--rn-muted)] sm:text-[12px]">
          $ <span className="text-[var(--rn-ink)]">brew radar --today</span>
          <span
            className="ml-0.5 inline-block w-[7px] animate-pulse bg-[var(--rn-ink)] align-[-0.12em]"
            style={{ height: "1em" }}
            aria-hidden
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-none tracking-tight text-[var(--rn-ink)] sm:text-[38px]">
              {greeting}
            </h1>
            <p className="mt-2 font-mono text-[12px] leading-relaxed text-[var(--rn-muted)] sm:text-[12.5px]">{statusLine}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--rn-muted)] shadow-[inset_0_0_0_1px_var(--rn-line)]">
              {dateLabel}
            </span>
            {isSubscribed ? (
              <span
                className="rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold"
                style={{
                  color: "var(--rn-bull)",
                  background: "color-mix(in srgb, var(--rn-bull) 14%, transparent)",
                }}
              >
                PRO · {trackedCount} tracked
              </span>
            ) : (
              <Link
                href="/subscribe"
                className="rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors"
                style={{
                  color: "var(--signal-neutral)",
                  background: "color-mix(in srgb, var(--signal-neutral) 12%, transparent)",
                }}
              >
                Upgrade →
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
