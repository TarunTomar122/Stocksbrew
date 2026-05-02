import Link from "next/link";

type Props = {
  isSignedIn: boolean;
  isSubscribed: boolean;
};

const PREVIEWS = [
  {
    label: "Blind spot",
    title: "Too much AI beta, not enough defensives",
    body: "Your portfolio is clustered in semis and mega-cap growth. Pro flags missing sector exposure before the rotation hits.",
  },
  {
    label: "Tomorrow",
    title: "Earnings and rating changes in one lane",
    body: "See earnings dates, analyst target changes, RSI extremes, volume spikes, and 52-week breaks across stocks you track.",
  },
  {
    label: "Refresh delta",
    title: "What changed since the last run",
    body: "Tikrr compares the latest news and score movement against the previous brief so you see the real change, not repeated filler.",
  },
];

export function LandingProPreview({ isSignedIn, isSubscribed }: Props) {
  if (isSignedIn && isSubscribed) return null;

  const ctaHref = isSignedIn ? "/subscribe" : "/watchlist";
  const cta = isSignedIn ? "Unlock your watchlist" : "Sign in to start";

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-primary/20 bg-surface-container-lowest shadow-card">
      <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.4fr]">
        <div className="border-b border-primary/15 bg-primary/[0.06] p-6 md:p-7 lg:border-b-0 lg:border-r">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
            Pro preview
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-on-surface">
            The free dashboard shows the market. Pro explains your market.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Free users get the market dashboard and launch-tier AI names. The $9 tier turns your watchlist into a twice-daily briefing with blind spots, red flags, and stock-specific micro reads.
          </p>
          <Link
            href={ctaHref}
            className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:brightness-105"
          >
            {cta}
          </Link>
        </div>

        <div className="grid grid-cols-1 divide-y divide-outline-variant/25 md:grid-cols-3 md:divide-x md:divide-y-0">
          {PREVIEWS.map((preview) => (
            <article key={preview.label} className="relative min-h-[220px] p-5 md:p-6">
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/[0.04]" />
              <div className="relative">
                <span className="rounded-full border border-outline-variant/40 bg-surface px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant">
                  Locked
                </span>
                <div className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  {preview.label}
                </div>
                <h3 className="mt-2 text-base font-black leading-tight text-on-surface">
                  {preview.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
                  {preview.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
