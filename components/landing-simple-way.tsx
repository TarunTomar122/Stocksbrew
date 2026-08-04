const STEPS = [
  {
    title: "Search a stock",
    body: "Open any US company for financials, news, price history and market context.",
  },
  {
    title: "Add it to Radar",
    body: "Track a company you own or want to follow. Your first three are free.",
  },
  {
    title: "We keep researching",
    body: "Get an alert when earnings, news or a price level gives you a reason to look again.",
  },
] as const;

export function LandingSimpleWay() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-14 lg:py-16">
        <div className="max-w-2xl">
          <p className="landing-section-kicker text-landing-brand">How it works</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl">
            Search once. Track what matters.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant">
            Start with a company page. Add it to Radar when you want us to keep watching it.
          </p>
        </div>

        <div className="mt-10 grid border-y border-outline-variant sm:grid-cols-3 sm:divide-x sm:divide-outline-variant">
          {STEPS.map((step, index) => (
            <article key={step.title} className="px-0 py-6 first:pt-6 last:pb-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-landing-brand">0{index + 1}</p>
              <h3 className="mt-3 text-[17px] font-bold tracking-tight text-on-surface">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-on-surface-variant">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
