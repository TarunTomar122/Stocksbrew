import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { ProfileSubscription } from "@/components/profile-subscription";
import { SignOutButton } from "@/components/sign-out-button";
import { PreferenceToggle } from "@/components/preference-toggle";

export const revalidate = 0;

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

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-md px-6 md:px-10 lg:px-16 py-12 flex flex-col gap-8">

        {/* ─── Account ─────────────────────────────────────── */}
        <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-5">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
            Account
          </span>

          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full overflow-hidden bg-primary flex-shrink-0">
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoURL} alt="" className="h-14 w-14 object-cover" />
              ) : (
                <span className="text-xl font-bold text-on-primary">{initial}</span>
              )}
            </div>
            <div className="min-w-0">
              {displayName && (
                <p className="text-base font-semibold text-on-surface truncate">{displayName}</p>
              )}
              {email && (
                <p className="text-sm text-on-surface-variant truncate">{email}</p>
              )}
              {joinedAt && (
                <p className="text-[11px] text-on-surface-variant mt-0.5">Member since {joinedAt}</p>
              )}
            </div>
          </div>

          <ProfileSubscription
            isSubscribed={subscribed}
            hasBillableSubscription={hasBillableSubscription}
            subscriptionStatus={userDoc?.subscriptionStatus ?? null}
            subscriptionPlan={userDoc?.subscriptionPlan ?? null}
            cancelAtPeriodEnd={userDoc?.cancelAtPeriodEnd ?? false}
          />
        </section>

        {/* ─── Preferences ─────────────────────────────────── */}
        <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-4">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
            Preferences
          </span>

          <PreferenceToggle
            field="email_alerts_enabled"
            icon="notifications"
            label="Alerts"
            description="Red-flag alerts for overbought RSI, 52-week lows, earnings next day"
            initialValue={userDoc?.email_alerts_enabled ?? true}
          />
          <PreferenceToggle
            field="email_digest_enabled"
            icon="mail"
            label="Email digest"
            description="Daily AI brief across your Radar, delivered to your inbox"
            initialValue={userDoc?.email_digest_enabled ?? true}
          />
          <PreferenceRow
            icon="schedule"
            label="Refresh cadence"
            description="How often your Radar brief regenerates"
            badge="Coming soon"
          />
        </section>

        {/* ─── Danger zone ─────────────────────────────────── */}
        <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-4">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
            Session
          </span>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-on-surface">Sign out</p>
              <p className="text-[12px] text-on-surface-variant">
                You'll need to sign back in to access your account and Pro features.
              </p>
            </div>
            <SignOutButton />
          </div>
        </section>

      </div>
    </main>
  );
}

function PreferenceRow({
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
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant mt-0.5 flex-shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-on-surface">{label}</span>
          {badge && (
            <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-on-surface-variant border border-outline-variant/40 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[12px] text-on-surface-variant mt-0.5">{description}</p>
      </div>
    </div>
  );
}
