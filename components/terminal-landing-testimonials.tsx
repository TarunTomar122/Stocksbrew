import { AnimatedIcon } from "@/components/animated-icon";

const PROOF_CARDS = [
  {
    icon: "verified",
    kicker: "Research",
    title: "Read the company in one place",
    body: "Financials, recent news, price levels, drivers and risks stay together on the stock page.",
    sample: "Example: Add below $182. Hold while margins stay above plan.",
  },
  {
    icon: "flag",
    kicker: "Watchlist",
    title: "Keep your stocks current",
    body: "Track holdings and watchlist names without repeating the same research every morning.",
    sample: "Example: Target $224. 18% room from today.",
  },
  {
    icon: "notifications_active",
    kicker: "Alerts",
    title: "Know when to look again",
    body: "Get earnings and price-level alerts for the stocks you follow.",
    sample: "Example: Buy zone reached. Earnings in 24 hours.",
  },
] as const;

/** Kept under the existing export name so the landing composition stays stable. */
export function TerminalLandingTestimonials() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-balance font-display text-[26px] font-medium tracking-tight text-on-surface sm:text-[32px]">
            Do the research once. We keep it current.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
          {PROOF_CARDS.map((card) => (
            <article key={card.kicker} className="flex h-full flex-col rounded-2xl border border-outline-variant bg-surface p-5">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container-low text-landing-brand">
                <AnimatedIcon name={card.icon} size={19} aria-hidden />
              </div>
              <h3 className="mt-4 text-[16px] font-semibold tracking-tight text-on-surface">{card.title}</h3>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-on-surface-variant">{card.body}</p>
              <p className="mt-5 rounded-xl bg-surface-container-low px-3 py-2.5 font-mono text-[11px] leading-relaxed text-on-surface-variant">
                {card.sample}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-center font-mono text-[10px] text-on-surface-variant">
          Examples show the format. Calls, targets, and alert levels vary by stock.
        </p>
      </div>
    </section>
  );
}
