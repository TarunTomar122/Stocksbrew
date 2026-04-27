import Link from "next/link";

export const metadata = {
  title: "Subscribe — Tikrr",
};

export default function SubscribePage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
        <div>
          <p className="text-xs uppercase tracking-widest text-indigo-400">Subscription</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Coming soon</h1>
          <p className="mt-3 text-sm text-white/70">
            Paid tier isn&apos;t live yet. When it launches, subscribing will let you add any
            stock outside the free AI-tier list to your personal AI tier — Tikrr will run
            news fetch, enrichment, and LLM briefs on it twice daily alongside your
            watchlist synthesis.
          </p>
        </div>

        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h2 className="text-sm font-semibold text-white">What you get</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-white/75">
            <li>• Track up to 10 stocks in your personal AI tier</li>
            <li>• Daily news-backed brief per tracked stock</li>
            <li>• No-news LLM read-through when coverage is quiet</li>
            <li>• Watchlist synthesis — cross-stock themes, blind spots, risk rollups</li>
            <li>• Twice-daily refresh before each market&apos;s open</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
          <h2 className="text-sm font-semibold text-white">Why it&apos;s paid</h2>
          <p className="mt-3 text-sm text-white/70">
            Every tracked stock means real LLM spend per refresh — news fetching, article
            enrichment, per-stock brief synthesis, and the watchlist-wide rollup. The free
            tier covers 15 US + 15 IN stocks for everyone; paying users extend that list
            with stocks they actually hold.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/80 hover:text-white"
          >
            Back to dashboard
          </Link>
          <span className="text-xs text-white/50">
            Want early access? Ping Tanay.
          </span>
        </div>
      </div>
    </main>
  );
}
