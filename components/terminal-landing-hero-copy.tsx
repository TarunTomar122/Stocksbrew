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
    <div>
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-1.5 text-[12px] font-medium text-on-surface-variant shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-landing-mint opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-landing-mint" />
        </span>
        <span className="text-on-surface">Live</span>
        <span className="text-on-surface-variant">|</span>
        <span>{indexed} tickers indexed</span>
      </div>

      <h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-on-surface sm:text-5xl lg:text-[3.35rem]">
        Know why your{" "}
        <span className="text-landing-brand">stocks moved</span>{" "}
        <span className="text-landing-brand">and what to do next.</span>
      </h1>

      <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-on-surface-variant">
        Add a ticker to Radar and get a clear <b className="font-semibold text-on-surface">buy, hold, sell, or watch</b> call with the reasons behind every move. Free for your first <b className="font-semibold text-on-surface">3 stocks</b>, no card required.
      </p>

      <ul className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2">
        {FEATURES.map(({ label, icon }) => (
          <li key={label}>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-on-surface-variant">
              <span
                className="material-symbols-outlined text-[15px] text-landing-brand"
                style={{ fontVariationSettings: "'wght' 500" }}
                aria-hidden
              >
                {icon}
              </span>
              {label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/watchlist" className="landing-btn-primary px-6 py-3 text-sm">
          Track your first stock →
        </Link>
        <Link href="/pulse" className="landing-btn-secondary px-6 py-3 text-sm">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'wght' 500" }}>
            trending_up
          </span>
          See today&apos;s movers
        </Link>
      </div>
    </div>
  );
}
