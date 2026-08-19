import { AnimatedIcon } from "@/components/animated-icon";

const STEPS = [
  {
    title: "Research any stock",
    body: "Search a ticker, then add it to your Watchlist.",
    points: [
      "Fundamentals, sentiment, analyst views and news in one place.",
      "Automated alerts so you know when to look again.",
    ],
    icon: "search",
  },
  {
    title: "Bring your AI up to speed",
    body: "Connect Stocksbrew to Claude or ChatGPT.",
    points: [
      "Ask about your Watchlist or any stock in plain English.",
      "Give your AI current, structured market context.",
    ],
    icon: "auto_awesome",
  },
  {
    title: "Stay in the loop",
    body: "Get the market sent to you.",
    points: [
      "Before-open, after-close and weekly emails.",
      "Alerts for earnings, news and price levels.",
    ],
    icon: "mail-check",
  },
] as const;

export function LandingSimpleWay() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-14 lg:py-16">
        <div className="max-w-2xl">
          <h2 className="text-balance text-[26px] font-semibold tracking-tight text-on-surface sm:text-[32px]">
            Search, track, stay updated.
          </h2>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-on-surface-variant">
            Everything you need to follow a stock without doing the same work every day.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <article
              key={step.title}
              className="landing-card flex flex-col rounded-xl p-5"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-landing-brand/10">
                <AnimatedIcon name={step.icon} size={22} className="text-landing-brand" aria-hidden />
              </div>
              <h3 className="text-balance mt-5 text-[17px] font-semibold tracking-tight text-on-surface">{step.title}</h3>
              <p className="text-pretty mt-2 text-[14px] leading-relaxed text-on-surface-variant">{step.body}</p>
              <ul className="text-pretty mt-4 space-y-2 text-[13px] leading-relaxed text-on-surface-variant">
                {step.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-landing-brand" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
