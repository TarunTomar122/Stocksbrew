import { AnimatedIcon } from "@/components/animated-icon";

const STEPS = [
  {
    title: "Search a stock",
    body: "Read its financials, valuation, filings, earnings, analyst targets and news.",
    icon: "search",
  },
  {
    title: "Add it to your Watchlist",
    body: "Track a company you own or want to follow. Your first three are free.",
    icon: "add",
  },
  {
    title: "We keep researching",
    body: "Get an alert when earnings, news or a price level gives you a reason to look again.",
    icon: "notifications_active",
  },
] as const;

export function LandingSimpleWay() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-14 lg:py-16">
        <div className="max-w-2xl">
          <h2 className="text-[26px] font-semibold tracking-tight text-on-surface sm:text-[32px]">
            Search once. Track what matters.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant">
            Start with a company page. Add it to your Watchlist when you want us to keep checking it.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <article
              key={step.title}
              className="landing-card flex flex-col gap-3 rounded-xl p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-landing-brand/10">
                <AnimatedIcon name={step.icon} size={20} className="text-landing-brand" aria-hidden />
              </div>
              <h3 className="text-[17px] font-semibold tracking-tight text-on-surface">{step.title}</h3>
              <p className="text-[14px] leading-relaxed text-on-surface-variant">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
