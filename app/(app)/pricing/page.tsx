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
    "Our call on every stock is free. Free adds the full report on five stocks you pick; Pro adds it on every stock.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "stocksbrew pricing: Free and Pro",
    description:
      "Free gives you the full report on five stocks you pick. Pro gives it on every stock.",
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
  tracked_stocks: "Stocks you follow, with prices, our call and the next earnings date",
  covered_stocks: "Stocks that get the full report",
  stock_call: "Our call on every stock: buy more, keep or sell some, with the date",
  stock_zones: "The full report: why we made the call, the prices where we'd buy more or sell some, and what would change our mind",
  briefing_personal: "A daily briefing on your stocks: what moved, why, and what to look at",
  portfolio_analytics: "How your money is spread, how much it swings, and how you did against the S&P 500",
  practice_account: "A practice account with $100,000 of pretend money",
  stock_report: "Stock pages: our view, the numbers, earnings, who owns it and the news",
  wire: "News, the calendar, company filings and every market",
  pre_earnings_read: "A note before each earnings report on what the company needs to show",
  signals: "Signals: big moves with the reason, what Reddit says and the President's posts",
  signals_archive: "How far back you can look at past signals",
  screener: "Find stocks with every filter",
  screener_call_filters: "Find stocks by our call and by our buy or sell prices",
  saved_screens: "Saved searches",
  themes: "Theme baskets: each stock and why it fits",
  compare: "Compare stocks side by side",
  export_data: "Download research tables as a spreadsheet (your own holdings always download free)",
  ask: "Ask questions about any stock or your portfolio and get answers with sources",
  follow_directory: "What funds, Congress and insiders own and trade, with how their picks did",
  followed_sources: "Investors you follow",
  strategies: "Ready-made strategies: the rules, how they did in the past, and the fine print",
  strategy_holdings: "What each strategy holds now and when it last changed",
  followed_strategies: "Strategies you follow, with a note each time they change",
  backtest: "Test your own rules on past prices",
  backtest_history: "How far back your tests can go",
  agents: "Agents that watch your stocks for a price, a date or news",
  price_alerts: "Price alerts by email",
  zone_alerts: "Email when a stock reaches our buy or sell price, reports earnings, or our call changes",
  email_market: "A daily market email",
  email_briefing: "Your morning email (only on days something changed) and a Saturday recap",
  agent_api: "Use stocksbrew from Claude, ChatGPT or your own code",
};

/** On a phone, the few differences that decide it come first; every other row is one tap away. */
const KEY_DIFFERENCES: FeatureId[] = ["covered_stocks", "briefing_personal", "email_briefing", "agents", "ask"];

const nameOf = (id: FeatureId) => PLAIN_NAMES[id] ?? (FEATURES[id] as Feature).name;

/** Rows whose "included" is a count a tick would hide: Pro's full report is on every stock, its briefing on every one you own. */
const EVERY_STOCK: Partial<Record<FeatureId, string>> = { covered_stocks: "Every stock", briefing_personal: "Every stock you own" };

/** One cell of the comparison table. */
function Cell({ rule, strong = false, id }: { rule: Rule; strong?: boolean; id?: FeatureId }) {
  if (id && rule.kind === "open" && EVERY_STOCK[id]) {
    return <span className={`text-[14px] leading-5 sm:text-[15px] ${strong ? "font-medium" : ""} text-oa-fg`}>{EVERY_STOCK[id]}</span>;
  }
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
  const said = describeRule(rule);
  const text = said === "Covered stocks" ? (strong ? "Every stock you own" : "5 stocks you pick") : id === "covered_stocks" && /^5 stocks?$/.test(said) ? "5 stocks you pick" : said;
  return <span className={`text-[14px] leading-5 sm:text-[15px] ${strong ? "font-medium text-oa-fg" : "text-oa-fg"}`}>{text}</span>;
}

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What do I actually get for free?",
    a: "Our call on every stock, every stock page, the news, the calendar, filings, markets, strategies with their past results, and what every fund, member of Congress and insider filed. You can follow as many stocks as you like, and five you pick get the full report: why we made the call, the prices where we'd buy more or sell some, an explanation every time one moves, and a note before each earnings report. You can swap one of the five each week.",
  },
  {
    q: "So what am I paying for with Pro?",
    a: "The full report on every stock instead of five you pick. Every holding is explained in your briefing, the briefing and the alerts arrive by email, and the daily limits on questions, tests and agents stop mattering.",
  },
  {
    q: "What happens when I hit a limit?",
    a: "It says which limit, how to get past it without paying (swap one of your five stocks, pause an agent, wait for the daily reset), and what Pro changes. Nothing you made is deleted. We never show a blurred row or a made-up number, and what you cannot see is not sent to your browser.",
  },
  {
    q: "Is the call different for people who pay?",
    a: "No. The call on a stock is the same for every reader and changes for everyone at the same time. So are the sources, the dates, the risk notes and the caveats on every backtest. Pro changes how many stocks get the full report and how much is done for you, not what the research says.",
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
        <h1 className="text-[34px] font-semibold leading-[40px] tracking-[-0.02em] text-oa-fg sm:text-[48px] sm:leading-[56px]">Free and Pro</h1>
        <p className="mt-2 max-w-[44rem] text-pretty text-[16px] leading-6 text-oa-muted-fg sm:text-[17px] sm:leading-[26px]">
          Our call on every stock is free for everyone. Free adds the full report on five stocks you pick; Pro adds it on every stock.
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
          <p className="text-[15px] font-medium text-oa-fg">Five of your stocks already get the full report, which is the Free limit.</p>
          <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">
            Swap one in your portfolio, or go Pro for the full report on every stock.
          </p>
        </Panel>
      ) : null}

      <PricingGrid plan={viewer.plan} market={market} prices={prices} trialEligible={viewer.trialEligible}>
        {/* Phone: only what differs between the plans first; every row is one tap away. */}
        <tbody className="sm:hidden">
          <tr>
            <th scope="colgroup" colSpan={3} className="border-y border-oa-border bg-oa-bg px-3 py-2 text-left text-[14px] font-semibold text-oa-fg">
              What changes with Pro
            </th>
          </tr>
          {KEY_DIFFERENCES.filter((id) => FEATURES[id] && describeRule(ruleFor(id, "free")) !== describeRule(ruleFor(id, "pro")))
            .map((id) => (
              <tr key={`diff-${id}`} className="border-b border-oa-border last:border-b-0">
                <th scope="row" colSpan={3} className="px-3 py-2.5 text-left align-top text-[14px] font-normal leading-5 text-oa-fg">
                  <span className="block text-pretty">{nameOf(id)}</span>
                  <span className="mt-1.5 grid grid-cols-2 gap-x-3 text-[13px]">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-oa-muted-fg">Free</span>
                      <Cell id={id} rule={ruleFor(id, "free")} />
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-oa-muted-fg">Pro</span>
                      <Cell id={id} rule={ruleFor(id, "pro")} strong />
                    </span>
                  </span>
                </th>
              </tr>
            ))}
        </tbody>
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
                        <Cell id={id} rule={ruleFor(id, "free")} />
                      </span>
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-oa-muted-fg">Pro</span>
                        <Cell id={id} rule={ruleFor(id, "pro")} strong />
                      </span>
                    </span>
                  </th>
                  <th scope="row" className="px-5 py-2.5 text-left align-top text-[15px] font-normal leading-[22px] text-oa-fg max-sm:hidden">
                    {nameOf(id)}
                  </th>
                  <td className="px-5 py-2.5 align-top max-sm:hidden">
                    <Cell id={id} rule={ruleFor(id, "free")} />
                  </td>
                  <td className="px-5 py-2.5 align-top max-sm:hidden">
                    <Cell id={id} rule={ruleFor(id, "pro")} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </PricingGrid>

      <h2 className="mb-3 mt-10 text-[17px] font-semibold leading-6 text-oa-fg">Questions people ask before paying</h2>
      <div className="oa-surface max-w-[52rem] overflow-hidden border border-oa-border bg-oa-card [&>div:last-child]:border-b-0 [&>div]:px-4">
        {/* The two questions everyone has before paying are open; the rest wait. */}
        {FAQS.map((faq, index) => (
          <Disclosure key={faq.q} question={faq.q} defaultOpen={index < 2}>
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
