import { ProPlanPicker } from "@/components/pro-plan-picker";

export function TerminalLandingProSection() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="landing-section-kicker text-landing-brand">Stocksbrew Pro</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
            Plans that match how you trade
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-on-surface-variant">
            Start free on Radar with three names. Upgrade when you want unlimited tracking, alerts, and the full read on every holding.
          </p>
        </div>

        <ProPlanPicker />
      </div>
    </section>
  );
}
