import Link from "next/link";

export const metadata = {
  title: "Subscribe — Tikrr",
};

export default function SubscribePage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 md:px-10 py-12 md:py-20">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-primary font-bold">Subscription</p>
          <h1 className="mt-3 text-3xl md:text-4xl font-black tracking-tight text-on-surface">Coming soon</h1>
          <p className="mt-3 text-sm md:text-[15px] text-on-surface-variant leading-relaxed">
            Paid tier isn&apos;t live yet. When it launches, subscribing will let you add any
            stock outside the free AI-tier list to your personal AI tier — Tikrr will run
            news fetch, enrichment, and LLM briefs on it twice daily alongside your
            watchlist synthesis.
          </p>
        </div>

        <section className="rounded-2xl border border-outline-variant/40 bg-surface p-6 md:p-8 shadow-card">
          <h2 className="text-sm font-bold text-on-surface tracking-tight">What you get</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-on-surface-variant">
            {[
              "Track up to 10 stocks in your personal AI tier",
              "Daily news-backed brief per tracked stock",
              "No-news LLM read-through when coverage is quiet",
              "Watchlist synthesis — cross-stock themes, blind spots, risk rollups",
              "Twice-daily refresh before each market's open",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-outline-variant/40 bg-surface p-6 md:p-8 shadow-card">
          <h2 className="text-sm font-bold text-on-surface tracking-tight">Why it&apos;s paid</h2>
          <p className="mt-3 text-sm text-on-surface-variant leading-relaxed">
            Every tracked stock means real LLM spend per refresh — news fetching, article
            enrichment, per-stock brief synthesis, and the watchlist-wide rollup. The free
            tier covers 15 US + 15 IN stocks for everyone; paying users extend that list
            with stocks they actually hold.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-xl border border-outline-variant px-5 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
          >
            Back to dashboard
          </Link>
          <span className="text-xs text-on-surface-variant">
            Want early access? Ping Tanay.
          </span>
        </div>
      </div>
    </main>
  );
}
