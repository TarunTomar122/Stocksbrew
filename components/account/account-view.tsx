import * as React from "react";

import type { AccountData } from "@/app/(app)/profile/account-data";
import { DeleteAccount, EmailSwitch, FeedbackForm, SignOutButton, TokenManager } from "@/components/account/account-controls";
import { CancelPlan, RefreshPlanButton, UpgradeButton } from "@/components/account/plan-actions";
import { CopyButton } from "@/components/docs/copy-button";
import { SideTocPage, TEXT_LINK } from "@/components/docs/side-toc";
import { Empty, FOCUS, PageHead, Panel, StatStrip, Tag, fmtDay } from "@/components/oa/kit";
import { FEATURES, FREE_COVERED_STOCKS, describeRule, type Feature } from "@/lib/entitlements";
import { US_PRO_MONTHLY } from "@/lib/pricing";

/**
 * The Account page. Server-rendered from one plain data object; the controls
 * that change something are small client components.
 */

const NUM = "oa-mono tabular-nums";

const TOC = [
  { id: "plan", label: "Plan and billing" },
  { id: "notifications", label: "Emails" },
  { id: "agent-access", label: "Agents and API tokens" },
  { id: "following", label: "Following and saved" },
  { id: "data", label: "Your data" },
  { id: "feedback", label: "Feedback" },
];

function Row({ label, children, sub }: { label: React.ReactNode; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-0.5 border-b border-oa-border px-4 py-2.5 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-[14px] leading-6 text-oa-muted-fg">{label}</dt>
      <dd className="min-w-0 text-[15px] leading-6 text-oa-fg">
        {children}
        {sub ? <span className="block text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{sub}</span> : null}
      </dd>
    </div>
  );
}

function Section({ id, title, lede, children }: { id: string; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h2 id={`${id}-h`} className="text-[19px] font-medium leading-7 tracking-tight text-oa-fg">
        {title}
      </h2>
      {lede ? <p className="mb-3 mt-0.5 max-w-[44rem] text-pretty text-[14.5px] leading-6 text-oa-muted-fg">{lede}</p> : <div className="mb-3" />}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function planLine(plan: AccountData["plan"]): { title: string; detail: string } {
  if (plan.kind === "gift") {
    return { title: "Pro, on us", detail: plan.giftExpiresAt ? `Granted by stocksbrew until ${fmtDay(plan.giftExpiresAt, true)}. Nothing is charged.` : "Granted by stocksbrew. Nothing is charged." };
  }
  if (plan.kind === "pro") {
    if (plan.cancelAtPeriodEnd) return { title: "Pro, ending", detail: "Cancelled. You keep Pro until the period you paid for ends, and you will not be charged again." };
    return { title: "Pro", detail: plan.billing === "yearly" ? "Billed yearly." : plan.billing === "monthly" ? "Billed monthly." : "Active." };
  }
  if (plan.status === "payment_failed" || plan.status === "failed") return { title: "Free", detail: "Your last payment did not go through, so Pro is paused. Subscribe again to restore it." };
  if (plan.status === "on_hold") return { title: "Free", detail: "Your subscription is on hold at the payment provider, so Pro is paused." };
  if (plan.status === "processing" || plan.status === "pending") return { title: "Free", detail: "A payment is still processing. Pro starts when it completes." };
  if (plan.status === "cancelled" || plan.status === "expired") return { title: "Free", detail: "Your earlier subscription ended." };
  return { title: "Free", detail: `Reading is free. The full treatment covers ${FREE_COVERED_STOCKS} stocks.` };
}

/** A few rows of the plan table that change between Free and Pro, so the difference is concrete. */
const PLAN_ROWS: (keyof typeof FEATURES)[] = ["covered_stocks", "ask", "agents", "price_alerts", "followed_sources", "email_briefing", "agent_api"];

function PlanCompare({ isPro }: { isPro: boolean }) {
  const rows = PLAN_ROWS.map((id) => (FEATURES as Record<string, Feature>)[id]).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-left text-[14px] leading-6">
        <thead>
          <tr>
            <th scope="col" className="oa-caption border-b border-oa-border bg-oa-bg px-4 py-1.5">
              What
            </th>
            <th scope="col" className={`oa-caption w-[5.75rem] border-b border-oa-border bg-oa-bg px-2 py-1.5 sm:w-[8.5rem] sm:px-3 ${isPro ? "" : "!text-oa-fg"}`}>
              Free{isPro ? "" : " · you"}
            </th>
            <th scope="col" className={`oa-caption w-[5.75rem] border-b border-oa-border bg-oa-bg px-2 py-1.5 pr-3 sm:w-[8.5rem] sm:px-3 sm:pr-4 ${isPro ? "!text-oa-fg" : ""}`}>
              Pro{isPro ? " · you" : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((feature) => (
            <tr key={feature.name} className="border-b border-oa-border last:border-b-0">
              <td className="px-4 py-1.5 align-top text-oa-fg/90">{feature.name}</td>
              <td className={`${NUM} px-2 py-1.5 align-top text-[12px] sm:px-3 sm:text-[12.5px] ${feature.free.kind === "locked" ? "text-oa-muted-fg" : "text-oa-fg"}`}>{describeRule(feature.free)}</td>
              <td className={`${NUM} px-2 py-1.5 pr-3 align-top text-[12px] text-oa-fg sm:px-3 sm:pr-4 sm:text-[12.5px]`}>{describeRule(feature.pro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinkList({ items, empty }: { items: { href: string; label: string; meta?: string }[]; empty: React.ReactNode }) {
  if (items.length === 0) return <p className="px-4 py-3 text-[14px] leading-6 text-oa-muted-fg">{empty}</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.href + item.label} className="border-b border-oa-border last:border-b-0">
          <a href={item.href} className={`flex items-center justify-between gap-3 px-4 py-2 hover:bg-oa-accent ${FOCUS}`}>
            <span className="min-w-0 truncate text-[14.5px] font-medium text-oa-fg">{item.label}</span>
            {item.meta ? <span className={`${NUM} shrink-0 text-[11.5px] text-oa-muted-fg`}>{item.meta}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function AccountView({ data }: { data: AccountData }) {
  const { plan } = data;
  const line = planLine(plan);
  const off = data.preview;
  const usagePct = data.developer.usage.limit > 0 ? Math.min(100, (data.developer.usage.used / data.developer.usage.limit) * 100) : 0;
  const followingCount = data.following.sources.length + data.following.strategies.length + data.following.markets.length + data.following.screens.length;

  return (
    <SideTocPage
      toc={TOC}
      label="Account"
      footer={
        <>
          <a href="/security" className={TEXT_LINK}>
            How your data is handled
          </a>
        </>
      }
    >
      {data.preview ? (
        <p role="note" className="oa-surface mb-5 border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-oa-card px-4 py-2.5 text-[14px] leading-6 text-oa-fg">
          <span className="oa-caption mr-2">Preview</span>
          Sample data, shown in development only. The controls are switched off. Sign in to see your own account.
        </p>
      ) : null}

      <PageHead
        label="Account"
        title={data.name ?? "Your account"}
        meta={
          <p className={`${NUM} flex flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] leading-4 text-oa-muted-fg`}>
            {data.email ? <span>{data.email}</span> : null}
            {data.email && data.joinedAt ? <span aria-hidden="true">·</span> : null}
            {data.joinedAt ? <span>joined {fmtDay(data.joinedAt, true)}</span> : null}
            <span aria-hidden="true">·</span>
            <span>signed in with Google</span>
          </p>
        }
        actions={<SignOutButton disabled={off} />}
      />

      <StatStrip
        className="mb-8"
        stats={[
          { label: "Plan", value: plan.isPro ? "Pro" : "Free", sub: plan.cancelAtPeriodEnd ? "ending this period" : plan.kind === "gift" ? "granted" : plan.billing ?? undefined },
          { label: "Holdings", value: data.portfolio.holdings, sub: `${data.portfolio.watching} watching` },
          { label: "Agents", value: data.agents ? data.agents.enabled : "n/a", sub: data.agents ? `${data.agents.total} set up` : "could not load" },
          { label: "API calls today", value: plan.isPro ? data.developer.usage.used : "n/a", sub: plan.isPro ? `of ${data.developer.usage.limit}` : "Pro only" },
        ]}
      />

      <div className="flex flex-col gap-10">
        {/* ── Plan ─────────────────────────────────────────────────────── */}
        <Section id="plan" title="Plan and billing">
          <Panel flush>
            <div className="flex flex-col gap-3 border-b border-oa-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[19px] font-medium leading-7 text-oa-fg">
                  {line.title}
                  {plan.isPro ? <Tag tone={plan.cancelAtPeriodEnd ? "warn" : "up"}>{plan.cancelAtPeriodEnd ? "ending" : "active"}</Tag> : null}
                </p>
                <p className="text-pretty text-[14.5px] leading-6 text-oa-muted-fg">{line.detail}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {!plan.isPro ? <UpgradeButton disabled={off} label={`Get Pro, $${US_PRO_MONTHLY} a month`} /> : null}
                {plan.kind === "pro" && plan.billable && !plan.cancelAtPeriodEnd ? <CancelPlan disabled={off} /> : null}
                <a href="/pricing" className={`inline-flex h-8 items-center rounded-lg px-2 text-[14px] font-medium text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
                  Compare plans
                </a>
              </div>
            </div>
            <dl>
              {plan.kind === "pro" ? (
                <>
                  <Row label="Billing">{plan.billing === "yearly" ? "Yearly" : plan.billing === "monthly" ? "Monthly" : "Not on file"}</Row>
                  <Row label="Started">{plan.subscribedAt ? <span className={NUM}>{fmtDay(plan.subscribedAt, true)}</span> : "Not on file"}</Row>
                  <Row label="Last payment">{plan.lastPaymentAt ? <span className={NUM}>{fmtDay(plan.lastPaymentAt, true)}</span> : "Not on file"}</Row>
                  <Row
                    label={plan.cancelAtPeriodEnd ? "Ends" : "Next charge"}
                    sub={
                      plan.cancelAtPeriodEnd
                        ? "At the end of the period you already paid for. The exact date is on your last receipt."
                        : `We do not store this date. It is on the receipt from our payment provider, Dodo Payments, and falls one ${plan.billing === "yearly" ? "year" : "month"} after the last payment.`
                    }
                  >
                    Not on file
                  </Row>
                  {!plan.billable ? (
                    <Row label="Cancelling" sub="There is no subscription id on your account, so there is nothing for the cancel button to cancel. Email us if you are being charged.">
                      Not available here
                    </Row>
                  ) : null}
                </>
              ) : plan.kind === "gift" ? (
                <Row label="Until">{plan.giftExpiresAt ? <span className={NUM}>{fmtDay(plan.giftExpiresAt, true)}</span> : "No end date on file"}</Row>
              ) : (
                <>
                  {plan.lastPaymentFailedAt ? (
                    <Row label="Payment failed">
                      <span className={NUM}>{fmtDay(plan.lastPaymentFailedAt, true)}</span>
                    </Row>
                  ) : null}
                  {plan.cancelledAt ? (
                    <Row label="Ended">
                      <span className={NUM}>{fmtDay(plan.cancelledAt, true)}</span>
                    </Row>
                  ) : null}
                  <Row label="Paid but still Free?" sub="Payments can take a minute to reach us. This asks the payment provider directly.">
                    <RefreshPlanButton disabled={off} />
                  </Row>
                </>
              )}
            </dl>
          </Panel>

          <Panel label={plan.isPro ? "What your plan includes" : "What changes with Pro"} right={<a href="/docs/start/free-vs-pro" className="hover:text-oa-fg hover:underline">Full table</a>} flush>
            <PlanCompare isPro={plan.isPro} />
          </Panel>
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">
            Payment is handled by Dodo Payments. We never see your card. There is no invoice list or payment-method editor in the app yet: receipts arrive by email from the payment provider.
          </p>
        </Section>

        {/* ── Emails ───────────────────────────────────────────────────── */}
        <Section id="notifications" title="Emails" lede="Email is the only channel. There are no texts or push notifications.">
          <Panel flush>
            <EmailSwitch
              field="email_digest_enabled"
              label="Daily brief"
              description={`About 8:30am ET on trading days, only when something changed in your stocks: a big move and why, a level reached, a new call, earnings. ${data.plan.isPro ? "Covers every stock you track." : "Covers your five covered stocks."}`}
              initial={data.emails.digest}
              disabled={off}
            />
            <EmailSwitch
              field="email_weekly_enabled"
              label="Weekly recap"
              description="Saturday morning: how your stocks did, how our calls did, and next week's earnings."
              initial={data.emails.weekly}
              disabled={off}
            />
            <EmailSwitch
              field="email_alerts_enabled"
              label="Alerts"
              description="When a price alert you set triggers, or an agent job finds something about your stocks."
              initial={data.emails.alerts}
              disabled={off}
            />
            <EmailSwitch
              field="email_product_enabled"
              label="Account emails"
              description="Setup tips, plan notices like your weekly swap opening, and one check-in if you've been away a while."
              initial={data.emails.product}
              disabled={off}
            />
          </Panel>
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">
            Emails go to {data.email ? <span className="text-oa-fg">{data.email}</span> : "the address on your Google account"}. Changing that address is not built: it follows your Google account. Billing emails from the
            payment provider are not controlled by these switches.
          </p>
        </Section>

        {/* ── Agents and tokens ────────────────────────────────────────── */}
        <Section
          id="agent-access"
          title="Agents and API tokens"
          lede={
            <>
              Two different things share the word. Agents inside the app watch your stocks for you. Developer access lets your own agent or script read your research over MCP, REST or the CLI.{" "}
              <a href="/developers" className={TEXT_LINK}>
                Developer docs
              </a>
            </>
          }
        >
          <Panel label="Agents in the app" right={<a href="/agents" className="hover:text-oa-fg hover:underline">Open Agents</a>} flush>
            {data.agents == null ? (
              <p className="px-4 py-3 text-[14px] leading-6 text-oa-muted-fg">We could not load your agents just now.</p>
            ) : data.agents.total === 0 ? (
              <p className="px-4 py-3 text-[14px] leading-6 text-oa-muted-fg">
                None yet. An agent checks one rule each market day and writes down what it found.{" "}
                <a href="/docs/agents/triggers" className={TEXT_LINK}>
                  How agents work
                </a>
              </p>
            ) : (
              <p className="px-4 py-3 text-[15px] leading-6 text-oa-fg">
                <span className={NUM}>{data.agents.enabled}</span> running, <span className={NUM}>{data.agents.total - data.agents.enabled}</span> paused. They only tell you. None of them can trade.
              </p>
            )}
          </Panel>

          {plan.isPro ? (
            <>
              <Panel label="Today's API allowance" flush>
                <div className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`${NUM} text-[19px] font-medium text-oa-fg`}>
                      {data.developer.usage.used}
                      <span className="text-[14px] font-normal text-oa-muted-fg"> of {data.developer.usage.limit} calls</span>
                    </p>
                    <p className={`${NUM} text-[11.5px] text-oa-muted-fg`}>resets 00:00 UTC</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-oa-bg" role="img" aria-label={`${data.developer.usage.used} of ${data.developer.usage.limit} calls used today`}>
                    <div className="h-full rounded-full bg-oa-primary" style={{ width: `${usagePct}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-oa-border px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="oa-caption">MCP server</p>
                    <code className={`${NUM} block break-all text-[13px] text-oa-fg`}>{data.developer.mcpUrl}</code>
                  </div>
                  <CopyButton value={data.developer.mcpUrl} label="Copy URL" />
                </div>
              </Panel>

              <Panel label="Connected agents (OAuth)" flush>
                {data.developer.connected == null ? (
                  <p className="px-4 py-3 text-[14px] leading-6 text-oa-muted-fg">We could not load connected agents just now.</p>
                ) : data.developer.connected.length === 0 ? (
                  <p className="px-4 py-3 text-[14px] leading-6 text-oa-muted-fg">
                    No agent is connected. Add the MCP server URL above in Claude Code, Cursor or another client and approve the sign-in.
                  </p>
                ) : (
                  <ul>
                    {data.developer.connected.map((agent) => (
                      <li key={agent.clientId} className="border-b border-oa-border px-4 py-2.5 last:border-b-0">
                        <p className="text-[15px] font-medium leading-6 text-oa-fg">{agent.name}</p>
                        <p className={`${NUM} text-[12px] leading-4 text-oa-muted-fg`}>
                          connected {agent.connectedAt ? fmtDay(agent.connectedAt, true) : "date unknown"} · last used {agent.lastUsedAt ? fmtDay(agent.lastUsedAt, true) : "never"} · access lapses{" "}
                          {agent.expiresAt ? fmtDay(agent.expiresAt, true) : "unknown"} if unused
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="border-t border-oa-border px-4 py-2.5 text-[13.5px] leading-5 text-oa-muted-fg">
                  Disconnecting an OAuth agent from here is not built yet. Remove the server in the client, or email us and we will revoke it.
                </p>
              </Panel>

              <Panel label="Personal tokens" flush>
                <TokenManager initial={data.developer.tokens} maxActive={data.developer.maxActiveTokens} mcpUrl={data.developer.mcpUrl} disabled={off} />
              </Panel>
            </>
          ) : (
            <Panel label="Developer access" flush>
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[36rem] text-pretty text-[14.5px] leading-6 text-oa-fg/90">
                  The API, the MCP server and the CLI are part of Pro: {describeRule(FEATURES.agent_api.pro)}. They read your research and your portfolio. They cannot trade.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <UpgradeButton disabled={off} />
                  <a href="/developers" className={`inline-flex h-8 items-center rounded-lg px-2 text-[14px] font-medium text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
                    Read the docs
                  </a>
                </div>
              </div>
            </Panel>
          )}
        </Section>

        {/* ── Following ────────────────────────────────────────────────── */}
        <Section id="following" title="Following and saved" lede="What you have chosen to keep an eye on, across the product. Change any of these on its own page.">
          {followingCount === 0 ? (
            <Panel flush>
              <Empty title="Nothing followed or saved yet">
                Follow a fund or a member of Congress on Follow, track a strategy, watch a market, or save a screen, and it shows up here.
              </Empty>
              <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-oa-border px-4 py-2.5 text-[14px]">
                {[
                  ["/follow", "Follow"],
                  ["/strategies", "Strategies"],
                  ["/markets", "Markets"],
                  ["/screener", "Screener"],
                ].map(([href, label]) => (
                  <a key={href} href={href} className={TEXT_LINK}>
                    {label}
                  </a>
                ))}
              </p>
            </Panel>
          ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Panel label="Investors" right={<span className={NUM}>{data.following.sources.length}</span>} flush>
              <LinkList
                items={data.following.sources.map((source) => ({ href: `/follow/${source.slug}`, label: source.name ?? source.slug }))}
                empty={
                  <>
                    None.{" "}
                    <a href="/follow" className={TEXT_LINK}>
                      Browse Follow
                    </a>
                  </>
                }
              />
            </Panel>
            <Panel label="Strategies" right={<span className={NUM}>{data.following.strategies.length}</span>} flush>
              <LinkList
                items={data.following.strategies.map((strategy) => ({ href: `/strategies/${strategy.slug}`, label: strategy.name ?? strategy.slug }))}
                empty={
                  <>
                    None.{" "}
                    <a href="/strategies" className={TEXT_LINK}>
                      Browse strategies
                    </a>
                  </>
                }
              />
            </Panel>
            <Panel label="Saved screens" right={<span className={NUM}>{data.following.screens.length}</span>} flush>
              <LinkList
                items={data.following.screens.map((screen) => ({
                  href: `/screener${screen.query ? `?${screen.query}` : ""}`,
                  label: screen.name,
                  meta: screen.created_at ? fmtDay(screen.created_at, true) : undefined,
                }))}
                empty={
                  <>
                    None.{" "}
                    <a href="/screener" className={TEXT_LINK}>
                      Open the screener
                    </a>
                  </>
                }
              />
            </Panel>
            <Panel label="Watched markets" right={<span className={NUM}>{data.following.markets.length}</span>} flush>
              {data.following.markets.length === 0 ? (
                <p className="px-4 py-3 text-[14px] leading-6 text-oa-muted-fg">
                  None.{" "}
                  <a href="/markets" className={TEXT_LINK}>
                    Open markets
                  </a>
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 px-4 py-3">
                  {data.following.markets.map((id) => (
                    <a key={id} href="/markets" className={`${NUM} inline-flex h-7 items-center rounded-md border border-oa-border bg-oa-bg px-2 text-[12.5px] uppercase text-oa-fg hover:bg-oa-accent ${FOCUS}`}>
                      {id}
                    </a>
                  ))}
                </div>
              )}
            </Panel>
          </div>
          )}
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">
            Your stocks and alerts live in{" "}
            <a href="/watchlist" className={TEXT_LINK}>
              Portfolio
            </a>
            .
          </p>
        </Section>

        {/* ── Data ─────────────────────────────────────────────────────── */}
        <Section id="data" title="Your data" lede="Yours to take and yours to remove, on any plan.">
          <Panel flush>
            <div className="flex flex-col gap-3 border-b border-oa-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-6 text-oa-fg">Download my data</p>
                <p className="max-w-[36rem] text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
                  One JSON file: profile, plan, portfolio, email settings, what you follow, alerts, agents and their recent runs, practice account, and the names of your tokens. Not included yet: Ask
                  conversations and analytics events.
                </p>
              </div>
              {off ? (
                <span className="inline-flex h-8 shrink-0 items-center rounded-lg bg-oa-secondary px-3 text-[14px] font-medium text-oa-secondary-fg opacity-50">Download</span>
              ) : (
                <a
                  href="/profile/export"
                  download
                  className={`inline-flex h-8 shrink-0 items-center rounded-lg bg-oa-secondary px-3 text-[14px] font-medium text-oa-secondary-fg hover:opacity-90 ${FOCUS}`}
                >
                  Download
                </a>
              )}
            </div>
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-[15px] font-medium leading-6 text-oa-fg">Delete account</p>
                <p className="max-w-[36rem] text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
                  Removes your account record, portfolio, what you follow, tokens and your Google sign-in with us, straight away.
                  {plan.billable ? " Your subscription is set to cancel at the end of the period." : ""} It does not yet remove alerts, agents and their logs, the practice account, Ask conversations or
                  feedback: email us and we will remove those by hand.{" "}
                  <a href="/security#deleting-your-account" className={TEXT_LINK}>
                    The full list
                  </a>
                </p>
              </div>
              <div className="shrink-0">
                <DeleteAccount billable={plan.billable} disabled={off} />
              </div>
            </div>
          </Panel>
        </Section>

        {/* ── Feedback ─────────────────────────────────────────────────── */}
        <Section id="feedback" title="Feedback">
          <Panel flush>
            <FeedbackForm disabled={off} />
          </Panel>
        </Section>
      </div>
    </SideTocPage>
  );
}
