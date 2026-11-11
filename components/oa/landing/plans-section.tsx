import { ProCheckoutButton } from "@/components/oa/pro-checkout-button";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { limitFor } from "@/lib/entitlements";
import { US_PRO_MONTHLY } from "@/lib/pricing";

import { H2, LEDE } from "./shared";

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

/** Free and Pro on the landing, with every number read from lib/entitlements.ts. */
export function PlansSection({ trialEligible }: { trialEligible: boolean }) {
  const covered = limitFor("covered_stocks", "free");
  return (
    <div>
      <div className="mx-auto max-w-2xl text-center">
        <h2 className={H2}>Our call is free on every stock. Pro gives the full report on all of them.</h2>
        <p className={`${LEDE} mx-auto`}>
          Our call says buy more, keep or sell some. The full report adds why, the prices where we&apos;d act and what would
          change our mind. Free gives it on five stocks you pick.
        </p>
      </div>
      <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
        <div className="oa-surface flex flex-col border border-oa-border bg-oa-card p-6">
          <p className="text-[17px] font-semibold leading-6 text-oa-fg">Free</p>
          <p className="oa-mono mt-3 text-[32px] font-medium leading-none tracking-tight">$0</p>
          <ul className="mt-5 flex flex-col gap-2">
            <Line>The full report on {covered} stocks you pick: the prices where we&apos;d act, why each move happened, a note before earnings</Line>
            <Line>Our call on every stock, and every filing, market and investor page</Line>
            <Line>
              {limitFor("ask", "free")} questions a day, {limitFor("backtest", "free")} tests of your own rules a day, {limitFor("agents", "free")} agents that
              email you, and a practice account
            </Line>
          </ul>
          <div className="mt-auto pt-6">
            <StartFreeButton surface="landing_pro_preview" variant="outline" label="Start free" className="w-full" />
          </div>
        </div>
        <div className="oa-surface flex flex-col border border-[color-mix(in_srgb,var(--oa-primary)_55%,transparent)] bg-oa-card p-6">
          <p className="text-[17px] font-semibold leading-6 text-oa-fg">Pro</p>
          <p className="oa-mono mt-3 text-[32px] font-medium leading-none tracking-tight">
            ${US_PRO_MONTHLY}
            <span className="ml-1.5 font-sans text-[14px] font-normal tracking-normal text-oa-muted-fg">a month</span>
          </p>
          <ul className="mt-5 flex flex-col gap-2">
            <Line>The full report on every stock, not just five</Line>
            <Line>Every holding explained in your briefing, in your inbox before the market opens</Line>
            <Line>An email when a stock reaches our buy or sell price, or our call changes</Line>
            <Line>
              Up to {limitFor("agents", "pro")} agents, {limitFor("ask", "pro")} questions a day, and tests over the full price history
            </Line>
          </ul>
          <div className="mt-auto pt-6">
            <ProCheckoutButton size="md" className="w-full">
              {trialEligible ? "Try Pro free for 3 days" : "Get Pro"}
            </ProCheckoutButton>
          </div>
        </div>
      </div>
      <p className="mt-5 text-center text-[14px] text-oa-muted-fg">
        Free and Pro readers see the same call on every stock.{" "}
        <a href="/pricing" className="text-oa-fg underline decoration-oa-border underline-offset-2">
          See every line of both plans
        </a>
      </p>
    </div>
  );
}
