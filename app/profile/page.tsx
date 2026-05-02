import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { SignOutButton } from "@/components/sign-out-button";

export const revalidate = 0;

export default async function ProfilePage() {
  const session = await getSessionUser();
  if (!session) redirect("/");

  const userDoc = await getUserDoc(session.uid).catch(() => null);
  const tracked = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];

  const subscribed = resolveIsSubscribed(userDoc);
  const displayName = session.displayName || userDoc?.display_name || null;
  const email = session.email || userDoc?.email || null;
  const photoURL = session.photoURL || userDoc?.photo_url || null;
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();

  const joinedAt = userDoc?.created_at
    ? new Date(userDoc.created_at).toLocaleDateString(undefined, {
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-outline-variant/20 pt-4">
            <InfoRow label="User ID" value={session.uid} mono />
            <InfoRow
              label="Plan"
              value={subscribed ? "Pro" : "Free"}
              highlight={subscribed}
            />
          </div>
        </section>

        {/* ─── Watchlist ───────────────────────────────────── */}
        <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
              Watchlist
            </span>
            <a
              href="/watchlist"
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Manage →
            </a>
          </div>

          {tracked.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No stocks tracked yet.{" "}
              <a href="/watchlist" className="text-primary hover:underline">
                Start tracking
              </a>
              .
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tracked.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center px-2.5 py-1 bg-surface-container-low text-[12px] font-bold text-on-surface rounded-full"
                >
                  {id}
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-on-surface-variant">
            {tracked.length} of 10 slots used
          </p>
        </section>

        {/* ─── Preferences ─────────────────────────────────── */}
        <section className="bg-surface-container-lowest brutalist-border p-6 flex flex-col gap-4">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary">
            Preferences
          </span>

          <PreferenceRow
            icon="notifications"
            label="Alerts"
            description="Red-flag alerts for overbought RSI, 52-week lows, earnings next day"
            badge="Coming soon"
          />
          <PreferenceRow
            icon="mail"
            label="Email digest"
            description="Daily AI brief across your watchlist, delivered to your inbox"
            badge="Coming soon"
          />
          <PreferenceRow
            icon="schedule"
            label="Refresh cadence"
            description="How often your watchlist brief regenerates"
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
                You'll need to sign back in to access your watchlist and AI briefs.
              </p>
            </div>
            <SignOutButton />
          </div>
        </section>

      </div>
    </main>
  );
}

function InfoRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant">
        {label}
      </span>
      <span
        className={`text-[13px] truncate ${mono ? "font-mono text-on-surface-variant" : "font-semibold"} ${highlight ? "text-primary" : "text-on-surface"}`}
      >
        {value}
      </span>
    </div>
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
