import { ProPlanPicker } from "@/components/pro-plan-picker";

export function TerminalLandingProSection() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="landing-section-kicker text-landing-brand">Stocksbrew Pro</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
            From a stock idea to a monitored decision
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant">
            Start free with three names on Radar. Pro gives you the full call and target, watches the stock for earnings and price zones, and lets your AI agent use the same research.
          </p>
        </div>

        <ProPlanPicker />
      </div>
    </section>
  );
}
