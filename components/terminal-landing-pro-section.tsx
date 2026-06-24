import { ProPlanPicker } from "@/components/pro-plan-picker";

const VALUE_ITEMS = [
  { emoji: "🎯", text: "Track unlimited names on Radar" },
  { emoji: "✅", text: "Buy, hold, sell, or watch calls on every stock" },
  { emoji: "🔔", text: "Alerts when setups shift" },
  { emoji: "📅", text: "Earnings setups before the print" },
  { emoji: "📊", text: "Portfolio report: crowding and gaps" },
  { emoji: "💬", text: "Reddit and news read for you" },
] as const;

export function TerminalLandingProSection() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-16 lg:py-20">
        <div className="landing-card mx-auto max-w-5xl overflow-hidden p-6 md:p-8 lg:p-10">
          <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start lg:gap-12">
            <div>
              <p className="landing-section-kicker text-landing-brand">Stocksbrew Pro</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-on-surface sm:text-3xl lg:text-[2rem] lg:leading-tight">
                Track the stocks you care about.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-on-surface-variant">
                Add your tickers to Radar and get the call on every name, alerts when something moves, earnings intel before the print, and a portfolio report that shows where you are crowded or missing exposure.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {VALUE_ITEMS.map((item) => (
                  <li key={item.text} className="flex items-start gap-2.5 text-[14px] leading-snug text-on-surface">
                    <span className="mt-0.5 shrink-0 text-[16px] leading-none" aria-hidden>
                      {item.emoji}
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>

            <ProPlanPicker />
          </div>
        </div>
      </div>
    </section>
  );
}
