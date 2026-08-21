import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { ProfileSubscription } from "@/components/profile-subscription";
import { ProfileFounderFeedback } from "@/components/profile-founder-feedback";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { SignOutButton } from "@/components/sign-out-button";
import { PreferenceToggle } from "@/components/preference-toggle";
import { ProfileRadarHighlight } from "@/components/profile-radar-highlight";
import { AgentAccessCard } from "@/components/agent-access-card";
import { SquircleSurface } from "@/components/oa/squircle";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { listPersonalAgentTokens } from "@/lib/agent-auth";
import { getAgentUsage } from "@/lib/agent-quota";
import { AGENT_DAILY_CALL_LIMIT, publicAppUrl } from "@/lib/agent-access-config";

export const revalidate = 0;

const FRAME = "mx-auto w-full max-w-6xl px-4 sm:px-6";
const H1 =
  "text-balance font-medium tracking-tight text-oa-fg text-[2rem] leading-[1.08] sm:text-4xl sm:leading-[1.06]";

function ProfileCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SquircleSurface
      className={`border border-oa-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-7 ${className}`}
    >
      <h2 className="text-sm font-medium text-oa-fg/80">{title}</h2>
      <div className="mt-3">{children}</div>
    </SquircleSurface>
  );
}

export default async function ProfilePage() {
  const session = await getSessionUser();
  if (!session) redirect("/");

  const userDoc = await getUserDoc(session.uid).catch(() => null);

  const subscribed = resolveIsSubscribed(userDoc);
  const subscriptionId = userDoc?.subscriptionId;
  const hasBillableSubscription = Boolean(
    typeof subscriptionId === "string" && subscriptionId.length > 0,
  );
  const displayName = session.displayName || userDoc?.display_name || null;
  const email = session.email || userDoc?.email || null;

  const created = userDoc?.created_at ? new Date(userDoc.created_at) : null;
  const joinedAt =
    created && Number.isFinite(created.getTime())
      ? created.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  const trackedCount = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc!.tracked_stocks!.length
    : 0;
  const [agentTokens, agentUsage] = subscribed
    ? await Promise.all([
        listPersonalAgentTokens(session.uid).catch(() => []),
        getAgentUsage(session.uid).catch(() => ({
          used: 0,
          remaining: AGENT_DAILY_CALL_LIMIT,
          limit: AGENT_DAILY_CALL_LIMIT,
          period: "day" as const,
        })),
      ])
    : [[], { used: 0, remaining: 200, limit: 200, period: "day" as const }];

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className={`${FRAME} flex flex-col gap-6 pb-24 pt-6 sm:gap-8`}>
        {/* title row: h1 + one control */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={H1}>
              {displayName ? (
                <>
                  {displayName}
                  <span className="text-oa-muted-fg">, here&apos;s your account.</span>
                </>
              ) : (
                "Your profile"
              )}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6 text-oa-muted-fg">
              {email ? <span>{email}</span> : null}
              {joinedAt ? <span>Member since {joinedAt}</span> : null}
            </p>
          </div>
          <span
            className="inline-flex h-fit shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium"
            style={
              subscribed
                ? {
                    color: "var(--signal-bullish)",
                    borderColor: "color-mix(in srgb, var(--signal-bullish) 30%, transparent)",
                  }
                : { color: "var(--oa-muted-fg)", borderColor: "var(--oa-border)" }
            }
          >
            {subscribed ? "Pro plan" : "Free plan"}
          </span>
        </header>

        {/* plates; the page background between them is the only divider */}
        <div className="flex flex-col gap-6 sm:gap-8">
          <ProfileCard title="Watchlist">
            <ProfileRadarHighlight trackedCount={trackedCount} />
          </ProfileCard>

          <ProfileCard title="Plan & billing">
            <ProfileSubscription
              isSubscribed={subscribed}
              hasBillableSubscription={hasBillableSubscription}
              subscriptionStatus={userDoc?.subscriptionStatus ?? null}
              subscriptionPlan={userDoc?.subscriptionPlan ?? null}
              cancelAtPeriodEnd={userDoc?.cancelAtPeriodEnd ?? false}
              subscriptionId={subscriptionId ?? null}
              embedded
            />
          </ProfileCard>

          <div id="agent-access" className="scroll-mt-24">
            <ProfileCard title="Agent access">
              <AgentAccessCard
                isSubscribed={subscribed}
                serverUrl={`${publicAppUrl()}/api/mcp`}
                initialTokens={agentTokens}
                initialUsage={agentUsage}
              />
            </ProfileCard>
          </div>

          <ProfileCard title="Preferences">
            <div className="flex flex-col divide-y divide-oa-border">
              <PreferenceToggle
                field="email_alerts_enabled"
                label="Alerts"
                description="Red-flag alerts for overbought RSI, 52-week lows, earnings next day"
                initialValue={userDoc?.email_alerts_enabled ?? true}
              />
              <PreferenceToggle
                field="email_digest_enabled"
                label="Market briefs"
                description="Short updates before the open, after the close, and each week"
                initialValue={userDoc?.email_digest_enabled ?? true}
              />
              <StaticRow
                label="Refresh cadence"
                description="How often your Watchlist calls refresh"
                badge="Coming soon"
              />
            </div>
          </ProfileCard>

          <ProfileCard title="Feedback">
            <ProfileFounderFeedback embedded />
          </ProfileCard>

          <ProfileCard title="Session & account">
            <div className="flex flex-col divide-y divide-oa-border">
              <AccountRow
                title="Sign out"
                description="You'll need to sign back in to access your account and Pro features."
              >
                <SignOutButton />
              </AccountRow>
              <AccountRow
                title="Delete account"
                description={`Permanently removes your account, Watchlist and saved preferences.${
                  hasBillableSubscription
                    ? " Your subscription will be scheduled to cancel at period end."
                    : ""
                }`}
              >
                <DeleteAccountButton hasBillableSubscription={hasBillableSubscription} />
              </AccountRow>
            </div>
          </ProfileCard>
        </div>
      </div>
    </main>
  );
}

function StaticRow({
  label,
  description,
  badge,
}: {
  label: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="py-4 first:pt-1 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-medium text-oa-fg">{label}</span>
        {badge ? (
          <span className="rounded-full border border-oa-border px-2 py-0.5 text-xs text-oa-muted-fg">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-sm leading-6 text-oa-muted-fg">{description}</p>
    </div>
  );
}

function AccountRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-oa-fg">{title}</p>
        <p className="mt-0.5 text-sm leading-6 text-oa-muted-fg">{description}</p>
      </div>
      {children}
    </div>
  );
}
