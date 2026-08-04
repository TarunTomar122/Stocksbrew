import { redirect } from "next/navigation";
import { AnimatedIcon } from "@/components/animated-icon";
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
import { listPersonalAgentTokens } from "@/lib/agent-auth";
import { getAgentUsage } from "@/lib/agent-quota";
import { publicAppUrl } from "@/lib/agent-access-config";

export const revalidate = 0;

const KICK =
  "font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant sm:text-[9.5px] sm:tracking-[0.12em]";

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
    <section
      className={`rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6 ${className}`}
    >
      <p className={KICK}>{title}</p>
      <div className="mt-4">{children}</div>
    </section>
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
  const photoURL = session.photoURL || userDoc?.photo_url || null;
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();

  const created = userDoc?.created_at ? new Date(userDoc.created_at) : null;
  const joinedAt =
    created && Number.isFinite(created.getTime())
      ? created.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;
  const trackedCount = Array.isArray(userDoc?.tracked_stocks) ? userDoc!.tracked_stocks!.length : 0;
  const alertsOn = userDoc?.email_alerts_enabled ?? true;
  const digestOn = userDoc?.email_digest_enabled ?? true;
  const [agentTokens, agentUsage] = subscribed
    ? await Promise.all([
        listPersonalAgentTokens(session.uid).catch(() => []),
        getAgentUsage(session.uid).catch(() => ({ used: 0, remaining: 500, limit: 500 })),
      ])
    : [[], { used: 0, remaining: 500, limit: 500 }];

  return (
    <main className="flex-grow bg-background">
      <div className="mx-auto w-full min-w-0 max-w-[1180px] px-3 py-4 sm:px-5 sm:py-7">
        <header className="mb-5 sm:mb-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-outline-variant bg-surface">
                {photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-extrabold text-on-surface">{initial}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-extrabold tracking-tight text-on-surface">
                    {displayName || "Your profile"}
                  </h1>
                  <span
                    className="inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
                    style={
                      subscribed
                        ? {
                            color: "var(--signal-bullish)",
                            borderColor:
                              "color-mix(in srgb, var(--signal-bullish) 28%, var(--outline-variant))",
                            background:
                              "color-mix(in srgb, var(--signal-bullish) 8%, var(--surface))",
                          }
                        : {
                            color: "var(--on-surface-variant)",
                            borderColor: "var(--outline-variant)",
                            background: "var(--surface-container-low)",
                          }
                    }
                  >
                    {subscribed ? "Pro" : "Free"}
                  </span>
                </div>
                {email ? (
                  <p className="mt-1 truncate font-mono text-[12px] text-on-surface-variant">{email}</p>
                ) : null}
                {joinedAt ? (
                  <p className="mt-0.5 font-mono text-[10.5px] text-on-surface-variant">
                    Member since {joinedAt}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 divide-x divide-outline-variant/40 rounded-2xl border border-outline-variant bg-surface">
            {[
              { label: "Tracked", value: String(trackedCount), sub: trackedCount === 1 ? "stock" : "stocks" },
              { label: "Plan", value: subscribed ? "Pro" : "Free", sub: subscribed ? "active" : "3-stock limit" },
              {
                label: "Inbox",
                value: alertsOn || digestOn ? "On" : "Off",
                sub: alertsOn && digestOn ? "alerts + digest" : alertsOn ? "alerts" : digestOn ? "digest" : "paused",
              },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={`min-w-0 px-3 py-3.5 text-center sm:px-4 sm:py-4 ${i === 0 ? "pl-4 sm:pl-5" : ""} ${i === 2 ? "pr-4 sm:pr-5" : ""}`}
              >
                <p className={KICK}>{stat.label}</p>
                <p className="mt-1 text-[18px] font-extrabold tabular-nums tracking-tight text-on-surface sm:text-[20px]">
                  {stat.value}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant">{stat.sub}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
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

          <div id="agent-access" className="scroll-mt-24 lg:col-span-2">
          <ProfileCard title="Agent access">
            <AgentAccessCard
              isSubscribed={subscribed}
              serverUrl={`${publicAppUrl()}/api/mcp`}
              initialTokens={agentTokens}
              initialUsage={agentUsage}
            />
          </ProfileCard>
          </div>

          <ProfileCard title="Preferences" className="lg:col-span-2">
            <div className="flex flex-col gap-3">
              <PreferenceRow>
                <PreferenceToggle
                  field="email_alerts_enabled"
                  icon="notifications"
                  label="Alerts"
                  description="Red-flag alerts for overbought RSI, 52-week lows, earnings next day"
                  initialValue={userDoc?.email_alerts_enabled ?? true}
                />
              </PreferenceRow>
              <PreferenceRow>
                <PreferenceToggle
                  field="email_digest_enabled"
                  icon="mail"
                  label="Email digest"
                  description="Watchlist summary and call updates delivered to your inbox"
                  initialValue={userDoc?.email_digest_enabled ?? true}
                />
              </PreferenceRow>
              <PreferenceRow>
                <PreferenceStatic
                  icon="schedule"
                  label="Refresh cadence"
                  description="How often your Watchlist calls refresh"
                  badge="Coming soon"
                />
              </PreferenceRow>
            </div>
          </ProfileCard>

          <ProfileCard title="Founder line" className="lg:col-span-2">
            <ProfileFounderFeedback embedded />
          </ProfileCard>

          <ProfileCard title="Session & account" className="lg:col-span-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-on-surface">Sign out</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                    You&apos;ll need to sign back in to access your account and Pro features.
                  </p>
                </div>
                <SignOutButton />
              </div>
              <div className="flex flex-col gap-4 rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-on-surface">Delete account</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                    Permanently removes your account, Watchlist and saved preferences.
                    {hasBillableSubscription
                      ? " Your subscription will be scheduled to cancel at period end."
                      : ""}
                  </p>
                </div>
                <DeleteAccountButton hasBillableSubscription={hasBillableSubscription} />
              </div>
            </div>
          </ProfileCard>
        </div>
      </div>
    </main>
  );
}

function PreferenceRow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-outline-variant/70 bg-surface-container-low/60 p-4">
      {children}
    </div>
  );
}

function PreferenceStatic({
  icon,
  label,
  description,
  badge,
}: {
  icon: string;
  label: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <AnimatedIcon name={icon} size={18} className="mt-0.5 shrink-0 text-[18px] text-on-surface-variant" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-on-surface">{label}</span>
          {badge ? (
            <span className="rounded-md border border-outline-variant px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-on-surface-variant">{description}</p>
      </div>
    </div>
  );
}
