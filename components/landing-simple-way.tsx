import { AnimatedIcon } from "@/components/animated-icon";

const STEPS = [
  {
    title: "Look up any stock",
    body: "Financials, valuation, earnings and news on one page, in plain English.",
    icon: "search",
  },
  {
    title: "Track what you own",
    body: "We keep watching after you close the tab. You hear only when something changes.",
    icon: "notifications_active",
  },
  {
    title: "Ask your AI",
    body: "Connect Claude or ChatGPT and question your watchlist in plain English.",
    icon: "auto_awesome",
  },
] as const;

export function LandingSimpleWay() {
  return (
    <section className="bg-background">
      <div className="landing-inner py-14 lg:py-16">
        <div className="max-w-2xl">
          <h2 className="text-balance font-display text-[26px] font-medium tracking-tight text-on-surface sm:text-[32px]">
            Three steps. Then get on with your day.
          </h2>
          <p className="text-pretty mt-3 text-[15px] leading-relaxed text-on-surface-variant">
            Search, track, get told. That is the whole loop.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <article
              key={step.title}
              className="landing-card flex flex-col rounded-2xl p-6"
            >
              <div className="flex size-11 items-center justify-center rounded-full bg-landing-brand/10">
                <AnimatedIcon name={step.icon} size={22} className="text-landing-brand" aria-hidden />
              </div>
              <h3 className="text-balance mt-5 text-[17px] font-medium tracking-tight text-on-surface">{step.title}</h3>
              <p className="text-pretty mt-2 text-[14px] leading-relaxed text-on-surface-variant">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
