import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { limitFor } from "@/lib/entitlements";
import { countWord } from "@/lib/plain-copy";
import { IN_PRO_MONTHLY_LABEL, US_PRO_MONTHLY } from "@/lib/pricing";

type Plan = "free" | "pro";
type Feature = Parameters<typeof limitFor>[0];

/** A plan's value for one row: a count of stocks or agents, "All you follow" when open, "No" when locked. */
function value(feature: Feature, plan: Plan, unit: "stock" | "agent" | "yes"): string {
  const n = limitFor(feature, plan);
  if (n === 0) return "No";
  if (unit === "yes") return "Yes";
  if (!Number.isFinite(n)) return unit === "stock" ? "All you follow" : "As many as you like";
  if (unit === "agent") return String(n);
  return `${n} ${n === 1 ? "stock" : "stocks"}`;
}

/**
 * The rows both cards share, in the same order, each with its value per plan (council, Nov 18, after tradytics): the
 * difference reads straight across, with no check icon repeated on every row (owner rule 1). Every value but the
 * call's coverage is read from lib/entitlements.ts. A row's label is at most four words.
 */
function rows(plan: Plan): Array<[string, string]> {
  return [
    ["Our call, with why", "700+ US stocks"],
    ["Full report", value("covered_stocks", plan, "stock")],
    ["Morning briefing", value("email_briefing", plan, "stock")],
    ["Agents", value("agents", plan, "agent")],
    ["Buy and sell emails", value("zone_alerts", plan, "yes")],
  ];
}

function Rows({ plan }: { plan: Plan }) {
  return (
    <dl className="mt-6 divide-y divide-oa-border border-t border-oa-border">
      {rows(plan).map(([label, shown]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5 text-[15px] leading-6">
          <dt className="text-oa-fg">{label}</dt>
          <dd className={`text-right tabular-nums ${shown === "No" ? "text-oa-muted-fg" : "font-medium text-oa-fg"}`}>{shown}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Free and Pro on the landing: the price and the action on top, then the same rows with each plan's value. The
 * section head and the link to /pricing live in oa-landing.tsx.
 */
export function PlansSection({ trialEligible, market = "US" }: { trialEligible: boolean; market?: "US" | "IN" }) {
  // One currency on both cards, the same as /pricing: rupees for visitors from India. The trial is US checkout only.
  const proPrice = market === "IN" ? IN_PRO_MONTHLY_LABEL : `$${US_PRO_MONTHLY}`;
  const freePrice = market === "IN" ? "₹0" : "$0";
  const trial = trialEligible && market === "US";
  const coveredWord = countWord(limitFor("covered_stocks", "free"));
  return (
    <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
      <div className="flex flex-col rounded-[20px] border border-oa-border bg-oa-card p-6 sm:p-7">
        <p className="text-[17px] font-semibold leading-6 text-oa-fg">Free</p>
        <p className="oa-mono mt-3 text-[36px] font-medium leading-none tracking-tight">{freePrice}</p>
        <div className="mt-6">
          {/* Says what Free gets, not a second "Start free": the header's is the view's one (judges, ship 42). */}
          <StartFreeButton surface="landing_pro_preview" variant="outline" label={`Pick your ${coveredWord} stocks`} className="w-full" />
          {/* Level with Pro's trial terms, so the rows start at the same height on both cards. */}
          {trial ? <p className="mt-2 min-h-[36px] text-[13px] leading-[18px] text-oa-muted-fg">No card needed.</p> : null}
        </div>
        <Rows plan="free" />
      </div>
      <div className="flex flex-col rounded-[20px] border border-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] bg-oa-card p-6 shadow-[0_24px_60px_-36px_rgba(154,72,22,0.45)] sm:p-7">
        <p className="text-[17px] font-semibold leading-6 text-oa-fg">Pro</p>
        <p className="oa-mono mt-3 text-[36px] font-medium leading-none tracking-tight">
          {proPrice}
          <span className="ml-1.5 font-sans text-[14px] font-normal tracking-normal text-oa-muted-fg">a month</span>
        </p>
        <div className="mt-6">
          <ProCheckoutButton size="md" className="w-full">
            {trial ? "Try Pro free for 3 days" : "Get Pro"}
          </ProCheckoutButton>
          {/* The trial's terms beside its button: a required disclosure, outside the word budget. */}
          {trial ? <p className="mt-2 min-h-[36px] text-[13px] leading-[18px] text-oa-muted-fg">Then {proPrice} a month unless you cancel. Card needed.</p> : null}
        </div>
        <Rows plan="pro" />
      </div>
    </div>
  );
}
