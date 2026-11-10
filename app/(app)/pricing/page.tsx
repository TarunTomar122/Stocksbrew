import type { Metadata } from "next";
import { headers } from "next/headers";

import { Disclosure } from "@/components/oa/disclosure";
import { AppPage, Panel } from "@/components/oa/kit";
import { PricingGrid, type PlanPrice } from "@/components/pricing/plan-cards";
import { SubscriptionActivator } from "@/components/subscription-activator";
import { SubscriptionSuccessModal } from "@/components/subscription-success-modal";
import {
  FEATURES,
  FEATURE_GROUPS,
  describeRule,
  ruleFor,
  type Feature,
  type FeatureId,
  type Rule,
} from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { US_PRO_MONTHLY, US_PRO_YEARLY, US_YEARLY_SAVE_PCT } from "@/lib/pricing";
import { SUBSCRIBE_SUPPORT_EMAIL } from "@/lib/subscribe-benefits";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "pricing"], "stocksbrew pricing: Free and Pro");

export const metadata: Metadata = {
  title: "Pricing: Free and Pro",
  description:
    "Reading is free on every stock, including our call. On Free your agent covers five stocks in full; on Pro it covers everything you own.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "stocksbrew pricing: Free and Pro",
    description:
      "On Free your agent covers five stocks in full. On Pro it covers everything you own.",
    url: "https://www.stocksbrew.online/pricing",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

type Props = {
  searchParams: {
    success?: string;
    status?: string;
    subscription_id?: string;
    from?: string;
  };
};

const ids = Object.keys(FEATURES) as FeatureId[];

// Row names said plainly where the entitlements table uses our own shorthand.
// Display only: the rules themselves still come from lib/entitlements.
const PLAIN_NAMES: Partial<Record<FeatureId, string>> = {
  tracked_stocks: "Stocks you track, with prices, our call and the next earnings date",
  covered_stocks: "Stocks we cover in full for you",
  stock_call: "Our call on every stock (buy more, keep, or sell some), with the date",
  stock_zones: "The full read: the prices where we'd buy more or sell some, why, what would change our mind, and past calls",
  portfolio_analytics: "Portfolio analytics: how your money is spread, how risky it is, and how you did against the S&P 500",
  practice_account: "Practice account with $100,000 of pretend money",
  wire: "News, the calendar, company filings and every market",
  signals: "Signals: unusual moves with the reason, Reddit talk and the President's posts",
  screener_call_filters: "Screen the whole market by our call and our buy or sell prices",
  zone_alerts: "Email when a stock reaches our buy or sell price, reports earnings, or our call changes",
  agent_api: "Connect your own AI agent (API, MCP server, command line)",
};

const nameOf = (id: FeatureId) => PLAIN_NAMES[id] ?? (FEATURES[id] as Feature).name;

/** One cell of the comparison table. */
function Cell({ rule, strong = false }: { rule: Rule; strong?: boolean }) {
  if (rule.kind === "locked") {
    return (
      <span className="text-oa-muted-fg" aria-label="Not included">
        <span aria-hidden="true">–</span>
      </span>
    );
  }
  if (rule.kind === "open") {
    return (
      <span className={strong ? "text-oa-primary" : "text-oa-fg"} aria-label="Included">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline size-4">
          <path d="m3 8.5 3.2 3L13 4.5" />
        </svg>
      </span>
    );
  }
  // "Covered stocks" is our word; say which stocks that is on each plan.
  const text = describeRule(rule) === "Covered stocks" ? (strong ? "Every stock you own" : "Your 5 covered stocks") : describeRule(rule);
  return <span className={`text-[14px] leading-5 sm:text-[15px] ${strong ? "font-medium text-oa-fg" : "text-oa-fg"}`}>{text}</span>;
}

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What do I actually get for free?",
    a: "You can read everything: our call and the full report on every stock, the wire, the calendar, filings, markets, strategies with their backtests, and what every fund, member of Congress and insider filed. You track as many stocks as you like, and your agent covers five of them in full, which means the prices where we'd buy more or sell some, an explanation every time one moves, and a read before each earnings report. You choose the five and can swap one a week.",
  },
  {
    q: "So what am I paying for with Pro?",
    a: "The agent working on all of it instead of five stocks. Every holding is covered and explained in the briefing, the briefing and the alerts arrive by email, and the daily limits on questions, backtests and agents stop mattering.",
  },
  {
    q: "What happens when I hit a limit?",
    a: "It says which limit, how to get past it without paying (swap a covered stock, pause an agent, wait for the daily reset), and what Pro changes. Nothing you made is deleted. We never show a blurred row or a made-up number, and what you cannot see is not sent to your browser.",
  },
  {
    q: "Is the call different for people who pay?",
    a: "No. The call on a stock is the same for every reader and changes for everyone at the same time. So are the sources, the dates, the risk notes and the caveats on every backtest. Pro changes how much the agent does for you, not what the research says.",
  },
  {
    q: "Does stocksbrew trade for me or connect to my broker?",
    a: "No, on either plan. There is no brokerage connection and nothing here can place a trade or move money. You read, you decide, and you act wherever you already invest.",
  },
  {
    q: "How do I cancel, and can I get a refund?",
    a: "Cancel in one click from your account page; Pro stays on until the end of the period you paid for and nothing is deleted when it ends. If Pro was not useful, email us within seven days of a charge and we refund it.",
  },
];

export default async function PricingPage({ searchParams }: Props) {
  const viewer = await getViewer();
  const callbackSuccess =
    searchParams.success === "1" || searchParams.status === "active" || searchParams.status === "succeeded";
  const subscriptionId = searchParams.subscription_id ?? null;

  const headerStore = await headers();
  const market: "US" | "IN" = headerStore.get("x-vercel-ip-country") === "IN" ? "IN" : "US";

  const prices: PlanPrice[] =
    market === "IN"
      ? [{ period: "monthly", price: "₹99", per: "a month" }]
      : [
          { period: "monthly", price: `$${US_PRO_MONTHLY}`, per: "a month" },
          {
            period: "yearly",
            price: `$${US_PRO_YEARLY}`,
            per: "a year",
            note: `Works out to $${(US_PRO_YEARLY / 12).toFixed(2)} a month, ${US_YEARLY_SAVE_PCT}% less than paying monthly.`,
          },
        ];

  return (
    <AppPage>
      <SubscriptionSuccessModal open={callbackSuccess && viewer.isSubscribed} subscriptionId={subscriptionId ?? undefined} />

      <header className="mb-6 px-2 pt-2 sm:mb-8 sm:px-0 sm:pt-6">
        <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.02em] text-oa-fg sm:text-[48px] sm:leading-[56px]">Pricing</h1>
        <p className="mt-2 max-w-[44rem] text-pretty text-[16px] leading-6 text-oa-muted-fg sm:text-[17px] sm:leading-[26px]">
          Every stock&apos;s research is free to read, our call included. Free covers five of your stocks in full; Pro covers every stock you own.
        </p>
      </header>

      {callbackSuccess && !viewer.isSubscribed ? (
        <Panel className="mb-5">
          <p className="text-[15px] font-medium text-oa-fg">Payment received. Turning Pro on.</p>
          <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">
            We are confirming the subscription with the payment provider. This usually takes a few seconds.
          </p>
          <div className="mt-3">
            <SubscriptionActivator
              subscriptionId={subscriptionId}
              status={searchParams.status ?? null}
              isSubscribed={viewer.isSubscribed}
              autoActivate
            />
          </div>
        </Panel>
      ) : null}

      {searchParams.from === "radar_limit" && viewer.plan === "free" ? (
        <Panel className="mb-5">
          <p className="text-[15px] font-medium text-oa-fg">Your agent is covering five stocks, which is the Free limit.</p>
          <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">
            Swap one from your portfolio, or go Pro and cover everything you own.
          </p>
        </Panel>
      ) : null}

      <PricingGrid plan={viewer.plan} market={market} prices={prices} trialEligible={viewer.trialEligible}>
        {FEATURE_GROUPS.map((group) => {
          const rows = ids.filter((id) => (FEATURES[id] as Feature).group === group);
          if (rows.length === 0) return null;
          return (
            <tbody key={group}>
              <tr>
                <th scope="colgroup" colSpan={3} className="border-y border-oa-border bg-oa-bg px-3 py-2 text-left text-[14px] font-semibold text-oa-fg sm:px-5">
                  {group}
                </th>
              </tr>
              {rows.map((id) => (
                <tr key={id} id={id} className="scroll-mt-24 border-b border-oa-border last:border-b-0 target:bg-[color-mix(in_srgb,var(--oa-primary)_9%,transparent)]">
                  {/* Phone: the feature across the full width, then what each plan gets under it. */}
                  <th scope="row" colSpan={3} className="px-3 py-2.5 text-left align-top text-[14px] font-normal leading-5 text-oa-fg sm:hidden">
                    <span className="block text-pretty">{nameOf(id)}</span>
                    <span className="mt-1.5 grid grid-cols-2 gap-x-3 text-[13px]">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-oa-muted-fg">Free</span>
                        <Cell rule={ruleFor(id, "free")} />
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-oa-muted-fg">Pro</span>
                        <Cell rule={ruleFor(id, "pro")} strong />
                      </span>
                    </span>
                  </th>
                  <th scope="row" className="px-5 py-2.5 text-left align-top text-[15px] font-normal leading-[22px] text-oa-fg max-sm:hidden">
                    {nameOf(id)}
                  </th>
                  <td className="px-5 py-2.5 align-top max-sm:hidden">
                    <Cell rule={ruleFor(id, "free")} />
                  </td>
                  <td className="px-5 py-2.5 align-top max-sm:hidden">
                    <Cell rule={ruleFor(id, "pro")} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </PricingGrid>

      <h2 className="mb-3 mt-10 text-[17px] font-semibold leading-6 text-oa-fg">Questions people ask before paying</h2>
      <div className="oa-surface max-w-[52rem] overflow-hidden border border-oa-border bg-oa-card [&>div:last-child]:border-b-0 [&>div]:px-4">
        {FAQS.map((faq) => (
          <Disclosure key={faq.q} question={faq.q}>
            {faq.a}
          </Disclosure>
        ))}
      </div>

      <p className="mt-6 max-w-[70ch] text-[14px] leading-[22px] text-oa-muted-fg">
        Something not covered here?{" "}
        <a href={`mailto:${SUBSCRIBE_SUPPORT_EMAIL}`} className="text-oa-fg underline decoration-oa-border underline-offset-2">
          Write to us
        </a>{" "}
        and a person answers. Payments are handled by Dodo Payments; we never see or store your card.
      </p>
    </AppPage>
  );
}
