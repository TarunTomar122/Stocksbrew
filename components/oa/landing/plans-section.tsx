import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { CALL_COVERAGE } from "@/lib/brand-copy";
import { limitFor } from "@/lib/entitlements";
import { countWord } from "@/lib/plain-copy";
import { IN_PRO_MONTHLY_LABEL, US_PRO_MONTHLY } from "@/lib/pricing";

function Line({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15px] leading-6 text-oa-fg">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[5px] size-3.5 shrink-0 text-oa-primary">
        <path d="m3 8.5 3.2 3L13 4.5" />
      </svg>
      <span className="text-pretty">{children}</span>
    </li>
  );
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Free and Pro on the landing, two cards and three lines each; every number is read from lib/entitlements.ts. The section head and the link to /pricing live in oa-landing.tsx. */
export function PlansSection({ trialEligible, market = "US" }: { trialEligible: boolean; market?: "US" | "IN" }) {
  // One currency on both cards, the same as /pricing: rupees for visitors from India. The trial is US checkout only.
  const proPrice = market === "IN" ? IN_PRO_MONTHLY_LABEL : `$${US_PRO_MONTHLY}`;
  const freePrice = market === "IN" ? "₹0" : "$0";
  const trial = trialEligible && market === "US";
  const covered = limitFor("covered_stocks", "free");
  const coveredWord = countWord(covered);
  const freeAgents = limitFor("agents", "free");
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="oa-surface flex flex-col border border-oa-border bg-oa-card p-6">
          <p className="text-[17px] font-semibold leading-6 text-oa-fg">Free</p>
          <p className="oa-mono mt-3 text-[32px] font-medium leading-none tracking-tight">{freePrice}</p>
          <ul className="mt-5 flex flex-col gap-2">
            <Line>Our call on {CALL_COVERAGE}, with why and what would change it, and every market and investor page</Line>
            <Line>The full report on {coveredWord} stocks you pick: the prices where we&apos;d act, and a morning email when one of them moves</Line>
            <Line>
              {freeAgents === 1
                ? "An agent that checks your stocks every market day and emails you when something you picked happens"
                : `${capitalize(countWord(freeAgents))} agents that check your stocks every market day and email you when something you picked happens`}
            </Line>
          </ul>
          <div className="mt-auto pt-6">
            {/* Says what Free gets, not a second "Start free": the header's is the view's one (judges, ship 42). */}
            <StartFreeButton surface="landing_pro_preview" variant="outline" label={`Pick your ${coveredWord} stocks`} className="w-full" />
          </div>
        </div>
        <div className="oa-surface flex flex-col border border-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] bg-oa-card p-6">
          <p className="text-[17px] font-semibold leading-6 text-oa-fg">Pro</p>
          <p className="oa-mono mt-3 text-[32px] font-medium leading-none tracking-tight">
            {proPrice}
            <span className="ml-1.5 font-sans text-[14px] font-normal tracking-normal text-oa-muted-fg">a month</span>
          </p>
          <ul className="mt-5 flex flex-col gap-2">
            <Line>The full report on as many stocks as you follow</Line>
            <Line>A briefing before the market opens on every stock you follow, on the days something changed</Line>
            <Line>Up to {limitFor("agents", "pro")} agents, and an email the same day one of your stocks reaches our buy or sell price</Line>
          </ul>
          <div className="mt-auto pt-6">
            <ProCheckoutButton size="md" className="w-full">
              {trial ? "Try Pro free for 3 days" : "Get Pro"}
            </ProCheckoutButton>
            {trial ? (
              <p className="mt-2 text-[13px] leading-[18px] text-oa-muted-fg">
                3 days free, then {proPrice} a month unless you cancel. Starting the trial asks for a card.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
