import { ProPlanPicker } from "@/components/pro-plan-picker";

export function TerminalLandingProSection() {
  return (
    <section className="border-t border-outline-variant bg-background">
      <div className="landing-inner py-14 lg:py-16">
        <ProPlanPicker />
      </div>
    </section>
  );
}
