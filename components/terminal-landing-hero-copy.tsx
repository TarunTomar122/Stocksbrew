import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";

const FEATURES = [
  { label: "Actionable insights", icon: "insights" },
  { label: "Data you can trust", icon: "verified" },
  { label: "Fast & free to start", icon: "bolt" },
] as const;

export function TerminalLandingHeroCopy({ tickerCount }: { tickerCount?: number }) {
  const indexed =
    typeof tickerCount === "number" && tickerCount > 0
      ? `${(4800 + tickerCount).toLocaleString()}`
      : "4,800+";

  return (
    <div className="flex min-w-0 w-full flex-col">
      <div className="mb-4 inline-flex w-fit max-w-full self-start items-center gap-2 rounded-full border border-outline-variant bg-surface px-3 py-1.5 text-[11px] font-medium text-on-surface-variant shadow-sm sm:mb-6 sm:px-3.5 sm:text-[12px]">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-landing-mint opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-landing-mint" />
        </span>
        <span className="text-on-surface">Live</span>
        <span className="text-on-surface-variant">|</span>
        <span>{indexed} tickers indexed</span>
      </div>

      <h1 className="font-display text-[1.75rem] font-extrabold leading-[1.12] tracking-tight text-on-surface sm:text-4xl sm:leading-[1.08] lg:text-[3.35rem]">
        Know why your{" "}
        <span className="text-landing-brand">stocks moved</span>
        <br className="sm:hidden" />
        <span className="hidden sm:inline"> </span>
        <span className="text-landing-brand">and what to do next.</span>
      </h1>

      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant sm:mt-6 sm:text-[17px]">
        Add a ticker to Radar and get a clear <b className="font-semibold text-on-surface">buy, hold, sell, or watch</b> call with the reasons behind every move. Free for your first <b className="font-semibold text-on-surface">3 stocks</b>, no card required.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 sm:mt-5 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
        {FEATURES.map(({ label, icon }) => (
          <li key={label} className={label === "Fast & free to start" ? "col-span-2 sm:col-span-1" : undefined}>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-on-surface-variant sm:text-[13px]">
              <AnimatedIcon name={icon} size={15} className="shrink-0 text-landing-brand" aria-hidden />
              {label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex w-full flex-col gap-2.5 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Link
          href="/watchlist"
          className="landing-btn-primary w-full justify-center px-6 py-3.5 text-sm sm:w-auto sm:py-3"
        >
          Track your first stock →
        </Link>
        <Link
          href="/pulse"
          className="landing-btn-secondary w-full justify-center px-6 py-3.5 text-sm sm:w-auto sm:py-3"
        >
          <AnimatedIcon name="trending_up" size={18} aria-hidden />
          See today&apos;s movers
        </Link>
      </div>
    </div>
  );
}
