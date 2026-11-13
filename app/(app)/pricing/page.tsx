import type { Metadata } from "next";
import { headers } from "next/headers";

import { Disclosure } from "@/components/oa/disclosure";
import { AppPage, Panel, ShowMore } from "@/components/oa/kit";
import { PlanCards, type PlanPrice } from "@/components/pricing/plan-cards";
import { SubscriptionActivator } from "@/components/subscription-activator";
import { SubscriptionSuccessModal } from "@/components/subscription-success-modal";
import {
  FEATURES,
  FEATURE_GROUPS,
  FREE_COVERED_STOCKS,
  can,
  describeRule,
  limitFor,
  listedFeatureIds,
  ruleFor,
  type Feature,
  type FeatureId,
  type Rule,
} from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { countWord } from "@/lib/plain-copy";
import { FREE_COVERED_WORD } from "@/lib/paywall-flag";
import { CALL_COVERAGE } from "@/lib/brand-copy";
import { IN_PRO_MONTHLY_LABEL, pricingMarket, US_PRO_MONTHLY, US_PRO_YEARLY, US_YEARLY_SAVE_PCT } from "@/lib/pricing";
import { SUBSCRIBE_SUPPORT_EMAIL } from "@/lib/subscribe-benefits";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "pricing"], "stocksbrew pricing: Free and Pro");

export const metadata: Metadata = {
  title: "Pricing: Free and Pro",
  description:
    `Our call on ${CALL_COVERAGE} is free. Free adds the full report on ${FREE_COVERED_WORD} stocks you pick; Pro adds it on all of them.`,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "stocksbrew pricing: Free and Pro",
    description: `Free gives you the full report on ${FREE_COVERED_WORD} stocks you pick. Pro gives it on every stock we have a call on.`,
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

// "The full report" and "Stocks that get the full report" said the same thing twice; one row says both.
const MERGED_INTO_ANOTHER_ROW = new Set<FeatureId>(["stock_zones"]);
const ids = listedFeatureIds().filter((id) => !MERGED_INTO_ANOTHER_ROW.has(id));

// Row names said plainly where the entitlements table uses our own shorthand.
// Display only: the rules themselves still come from lib/entitlements.
const PLAIN_NAMES: Partial<Record<FeatureId, string>> = {
  tracked_stocks: "Stocks you follow, with prices, our call and the next earnings date",
  covered_stocks: "The full report: the prices where we'd buy more or sell some, the whole brief, and how the call has moved",
  stock_call: `Our call on ${CALL_COVERAGE}: buy more, keep or sell some, why, and what would change it`,
  stock_zones: "The full report: the prices where we'd buy more or sell some, the whole brief, and how the call has moved",
  briefing_personal: "A daily briefing on your stocks: what moved, why, and what to look at",
  reason_watch: "Your reasons checked, with lines like revenue growth over 20% judged the night a report lands",
  portfolio_analytics: "How your money is spread, what reports soon and our calls on what you hold",
  portfolio_analysis_deep: "Inside your funds, what drives the swings, past crashes and what made the money",
  practice_account: "A practice account with $100,000 of pretend money",
  stock_report: "Stock pages: our view, the numbers, earnings, who owns it and the news",
  wire: "News, the calendar, company filings and every market",
  filing_changes: "The risks each company added or dropped in its latest annual or quarterly filing",
  pre_earnings_read: "A note before each earnings report on what the company needs to show",
  signals: "Signals: big moves with the reason, what Reddit says and the President's posts",
  signals_archive: "How far back you can look at past signals",
  screener: "Find stocks with every filter",
  screener_call_filters: "Find stocks by our call and by our buy or sell prices",
  saved_screens: "Saved searches",
  themes: "Theme baskets: each stock and why it fits",
  compare: "Compare stocks side by side",
  export_data: "Download research tables as a spreadsheet (your own holdings always download free)",
  deep_research: "A long research report on any stock, with every source",
  ask: "Ask questions about any stock or your portfolio and get answers with sources",
  follow_directory: "What funds, Congress and insiders own and trade, with how their picks did",
  followed_sources: "Investors you follow",
  strategies: "Ready-made strategies: the rules, how they did in the past, and the fine print",
  strategy_holdings: "What each strategy holds now and when it last changed",
  followed_strategies: "Strategies you follow, with a note each time they change",
  backtest: "Test your own rules on past prices",
  backtest_history: "How far back your tests can go",
  agents: "Agents: a price, an earnings date, a big move, a trade by Congress or insiders, an idea basket or a thesis, counted together",
  price_alerts: "One-tap price alerts by email, from a stock page",
  zone_alerts: "One-tap emails when a stock reaches our buy or sell price, reports earnings, or our call changes",
  email_market: "A daily market email",
  email_briefing: "Your morning email (only on days something changed) and a Saturday recap",
  agent_api: "Use stocksbrew from Claude, ChatGPT or your own code",
  agent_events: "Agents that act on a new company filing or a turn in the news",
};

/** The few differences that decide it, shown under the plan cards; every other row is one tap away. */
const DIFFERENCES: FeatureId[] = ["covered_stocks", "briefing_personal", "reason_watch", "email_briefing", "zone_alerts", "ask", "agents", "backtest_history"];

/** Shorter names for the difference rows, where the full row name would wrap three times on a phone. */
const DIFF_NAMES: Partial<Record<FeatureId, string>> = {
  covered_stocks: "The full report: the prices where we'd act, the whole brief, how the call has moved",
  briefing_personal: "A daily briefing on what moved in your stocks and why",
  reason_watch: "Your reasons checked the night a report lands",
  email_briefing: "A morning email when something changed in your stocks",
  zone_alerts: "One-tap emails when a stock reaches our buy or sell price, reports earnings, or our call changes",
  ask: "Questions you can ask about any stock or your portfolio",
  agents: "Agents: a price or event to watch, an idea basket or a thesis",
  backtest_history: "Years of past prices you can test your own buying rules on",
};

const nameOf = (id: FeatureId) => PLAIN_NAMES[id] ?? (FEATURES[id] as Feature).name;

/** Rows whose "included" is a count a tick would hide: Pro's full report is on every stock, its briefing on every one you own. */
const EVERY_STOCK: Partial<Record<FeatureId, string>> = {
  covered_stocks: "Every stock",
  briefing_personal: "Every stock you own",
  reason_watch: "Every reason you save",
  email_briefing: "Every stock you follow",
  backtest_history: "Every year we have",
};

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
  const chosen = `${FREE_COVERED_STOCKS} stocks you choose`;
  const text = said === "Covered stocks" ? (strong ? "Every stock you own" : chosen) : id === "covered_stocks" && said === `${FREE_COVERED_STOCKS} stocks` ? chosen : said;
  return <span className={`text-[14px] leading-5 sm:text-[15px] ${strong ? "font-medium text-oa-fg" : "text-oa-fg"}`}>{text}</span>;
}

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What do I actually get for free?",
    a: `Our call on ${CALL_COVERAGE}, why we made it and what would change it, and every page on the site. You can follow as many stocks as you like. ${FREE_COVERED_WORD[0].toUpperCase()}${FREE_COVERED_WORD.slice(1)} of them, which you choose, get the full report: the prices where we'd act, the whole brief, and a morning email when one moves or reports earnings. You can swap one of the ${FREE_COVERED_WORD} each week.`,
  },
  {
    q: "So what am I paying for with Pro?",
    a: "The full report on every stock you follow. Your daily briefing and morning email explain everything you own, and you get far more questions, tests and agents each day, plus the one-tap earnings and call-change emails.",
  },
  {
    q: "What happens when I hit a limit?",
    a: `It says which limit, how to get past it without paying (swap one of your ${FREE_COVERED_WORD} stocks, pause an agent, wait for the daily reset), and what Pro changes. Nothing you made is deleted, and we never show a blurred row or a made-up number.`,
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
  const market = pricingMarket(headerStore.get("x-vercel-ip-country"));

  const prices: PlanPrice[] =
    market === "IN"
      ? [{ period: "monthly", price: IN_PRO_MONTHLY_LABEL, per: "a month" }]
      : [
          { period: "monthly", price: `$${US_PRO_MONTHLY}`, per: "a month" },
          {
            period: "yearly",
            price: `$${US_PRO_YEARLY}`,
            per: "a year",
            note: `Works out to $${(US_PRO_YEARLY / 12).toFixed(2)} a month, ${US_YEARLY_SAVE_PCT}% less than paying monthly.`,
          },
        ];

  const freePoints = [
    `Our call on ${CALL_COVERAGE}`,
    `A daily briefing and morning email on your ${FREE_COVERED_WORD} stocks`,
    `${limitFor("ask", "free")} questions a day about any stock`,
    limitFor("agents", "free") === 1
      ? "An agent: a price or date to watch, an idea basket or a thesis"
      : `${limitFor("agents", "free")} agents: a price or date to watch, an idea basket or a thesis`,
    "A practice account with $100,000 of pretend money",
    // Free to read for everyone (lib/entitlements.ts filing_changes).
    "The risks each company added or dropped in its latest filing",
  ];
  const proPoints = [
    "Everything in Free",
    "The daily briefing and morning email on every stock you follow",
    `${limitFor("ask", "pro")} questions a day and up to ${limitFor("agents", "pro")} agents`,
    "Every reason you save, checked by the agent",
    "An email when a stock reaches our buy or sell price, reports earnings or gets a new call",
    // Only true on the tighter line, where these agents are Pro-only.
    ...(can("agent_events", "free") ? [] : ["Agents that read every new filing and news turn on your stocks"]),
  ];
  const differences = DIFFERENCES.filter((id) => FEATURES[id] && describeRule(ruleFor(id, "free")) !== describeRule(ruleFor(id, "pro")));

  return (
    <AppPage>
      <SubscriptionSuccessModal open={callbackSuccess && viewer.isSubscribed} subscriptionId={subscriptionId ?? undefined} />

      <header className="mb-5 px-2 pt-2 sm:mb-6 sm:px-0 sm:pt-4">
        <h1 className="text-balance text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-oa-fg sm:text-[36px] sm:leading-[44px]">
          Our calls are free. Pro gets you the full report.
        </h1>
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
          <p className="text-[15px] font-medium text-oa-fg">{FREE_COVERED_WORD.charAt(0).toUpperCase() + FREE_COVERED_WORD.slice(1)} of your stocks already get the full report, which is the Free limit.</p>
          <p className="mt-1 text-[14px] leading-5 text-oa-muted-fg">
            Swap one in your portfolio, or go Pro for the full report on every stock.
          </p>
        </Panel>
      ) : null}

      <PlanCards
        plan={viewer.plan}
        market={market}
        prices={prices}
        trialEligible={viewer.trialEligible}
        freePoints={freePoints}
        proPoints={proPoints}
      />

      <section className="oa-surface mt-3 overflow-hidden border border-oa-border bg-oa-card" aria-labelledby="pro-adds">
        <div className="border-b border-oa-border px-4 py-3 sm:px-5">
          <h2 id="pro-adds" className="text-[16px] font-semibold leading-6 text-oa-fg">
            What changes with Pro
          </h2>
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">Everything else is the same on both plans.</p>
        </div>
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col />
            <col className="w-[6.5rem] sm:w-[12rem] lg:w-[15rem]" />
            <col className="w-[7rem] bg-[color-mix(in_srgb,var(--oa-primary)_4%,transparent)] sm:w-[12rem] lg:w-[15rem]" />
          </colgroup>
          <thead>
            <tr className="border-b border-oa-border bg-oa-bg text-left">
              <th scope="col" className="px-3 py-2 text-[12.5px] font-medium text-oa-muted-fg sm:px-5">
                <span className="sr-only">Feature</span>
              </th>
              <th scope="col" className="px-3 py-2 text-[13px] font-semibold text-oa-fg sm:px-5">Free</th>
              <th scope="col" className="px-3 py-2 text-[13px] font-semibold text-oa-fg sm:px-5">Pro</th>
            </tr>
          </thead>
          <tbody>
            {differences.map((id) => (
              <tr key={id} className="border-b border-oa-border last:border-b-0">
                <th scope="row" className="px-3 py-3 text-left align-top text-[14px] font-normal leading-5 text-oa-fg sm:px-5 sm:text-[15px] sm:leading-[22px]">
                  {DIFF_NAMES[id] ?? nameOf(id)}
                </th>
                <td className="px-3 py-3 align-top sm:px-5">
                  <Cell id={id} rule={ruleFor(id, "free")} />
                </td>
                <td className="px-3 py-3 align-top sm:px-5">
                  <Cell id={id} rule={ruleFor(id, "pro")} strong />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* One plain line on how agents count (lib/basket-agent/data.ts runningAgents) and the free alerts (price_alerts). */}
        <p className="border-t border-oa-border px-4 py-3 text-pretty text-[13.5px] leading-5 text-oa-muted-fg sm:px-5">
          Idea baskets and theses count as agents too. Free also keeps {countWord(limitFor("price_alerts", "free"))} price alerts.
        </p>
      </section>

      <ShowMore always label="Compare every feature, both plans" less="Hide the full comparison" className="mt-0">
        <section className="oa-surface overflow-hidden border border-oa-border bg-oa-card">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col />
              <col className="w-[7.25rem] sm:w-[12rem] lg:w-[15rem]" />
              <col className="w-[7.25rem] bg-[color-mix(in_srgb,var(--oa-primary)_4%,transparent)] sm:w-[12rem] lg:w-[15rem]" />
            </colgroup>
            <thead className="max-sm:hidden">
              <tr className="text-left">
                <th scope="col" className="px-5 py-2.5 text-[13px] font-medium text-oa-muted-fg">
                  <span className="sr-only">Feature</span>
                </th>
                <th scope="col" className="px-5 py-2.5 text-[14px] font-semibold text-oa-fg">Free</th>
                <th scope="col" className="px-5 py-2.5 text-[14px] font-semibold text-oa-fg">Pro</th>
              </tr>
            </thead>
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
          </table>
        </section>
      </ShowMore>

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
