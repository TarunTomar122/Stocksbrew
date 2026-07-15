import { AnimatedIcon } from "@/components/animated-icon";

const PROOF_CARDS = [
  {
    icon: "verified",
    kicker: "Detailed call",
    title: "Know the stance and the zones",
    body: "See the add, hold, or trim call with its buy zone, trim zone, drivers, and risks.",
    sample: "Example: Add below $182. Hold while margins stay above plan.",
  },
  {
    icon: "flag",
    kicker: "Stocksbrew target",
    title: "Put the target next to today",
    body: "See our target price, the room from the current price, and the evidence that could change it.",
    sample: "Example: Target $224. 18% room from today.",
  },
  {
    icon: "notifications_active",
    kicker: "Radar alert",
    title: "Come back when it matters",
    body: "Get automatic earnings and zone alerts, or create a manual price alert for any stock you follow.",
    sample: "Example: Buy zone reached. Earnings in 24 hours.",
  },
] as const;

/** Kept under the existing export name so the landing composition stays stable. */
export function TerminalLandingTestimonials() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="landing-section-kicker text-landing-brand">What Pro does</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl">
            One decision loop, not another news feed
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-on-surface-variant sm:text-[15px]">
            Understand the setup, track it on Radar, and let the next important event bring you back.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
          {PROOF_CARDS.map((card) => (
            <article key={card.kicker} className="flex h-full flex-col rounded-2xl border border-outline-variant bg-surface p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container-low text-landing-brand">
                <AnimatedIcon name={card.icon} size={19} aria-hidden />
              </span>
              <p className="mt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-landing-brand">
                {card.kicker}
              </p>
              <h3 className="mt-1.5 text-[16px] font-bold tracking-tight text-on-surface">{card.title}</h3>
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
