const STEPS = [
  {
    title: "Read the current view",
    body: "See whether the setup is looking better, worse, or mostly unchanged.",
  },
  {
    title: "Know the levels",
    body: "Find the buy zone, trim zone, target, and the assumptions behind them.",
  },
  {
    title: "Come back when it matters",
    body: "Get notified about earnings, price levels, and other changes you choose to track.",
  },
] as const;

export function LandingSimpleWay() {
  return (
    <section className="border-b border-outline-variant bg-background">
      <div className="landing-inner py-14 lg:py-16">
        <div className="max-w-2xl">
          <p className="landing-section-kicker text-landing-brand">How it works</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl">
            A simple way to keep up with a stock.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant">
            Most stock apps are built to keep you scrolling. StocksBrew is built for the stocks you have already decided are worth following.
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
