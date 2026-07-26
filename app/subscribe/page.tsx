import type { Metadata } from "next";
import { AnimatedIcon } from "@/components/animated-icon";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { SubscribePricing } from "@/components/subscribe-pricing";
import { SubscriptionSuccessModal } from "@/components/subscription-success-modal";
import { SubscriptionActivator } from "@/components/subscription-activator";

export const metadata: Metadata = {
  title: "Pricing & Plans",
  description: "Try Stocksbrew Pro free for 3 days. Get detailed calls and zones, Stocksbrew targets, unlimited Radar, alerts, and current stock context for your AI.",
  alternates: { canonical: "/subscribe" },
  openGraph: {
    title: "stocksbrew Pro - Pricing & Plans",
    description: "Try Stocksbrew Pro free for 3 days, then get detailed calls, targets, Radar alerts, and current stock context for your AI for $9 per month.",
    url: "https://www.stocksbrew.online/subscribe",
  },
  twitter: {
    card: "summary_large_image",
    title: "stocksbrew Pro - Pricing & Plans",
    description: "Try Stocksbrew Pro free for 3 days, then get detailed calls, targets, Radar alerts, and current stock context for your AI for $9 per month.",
  },
};

type Props = {
  searchParams: {
    success?: string;
    status?: string;
    subscription_id?: string;
    email?: string;
    from?: string;
  };
};

export default async function SubscribePage({ searchParams }: Props) {
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const callbackSuccess =
    searchParams.success === "1" ||
    searchParams.status === "active" ||
    searchParams.status === "succeeded";
  const justSubscribed = callbackSuccess || isSubscribed;
  const subscriptionId = searchParams.subscription_id ?? null;

  const headerStore = await headers();
  const ipCountry = headerStore.get("x-vercel-ip-country") ?? "";
  const market: "US" | "IN" = ipCountry === "IN" ? "IN" : "US";

  const trustItems = [
    { icon: "lock", text: "Secure checkout" },
    { icon: "sync_alt", text: "7-day refund" },
    { icon: "cancel", text: "Cancel anytime" },
  ];

  return (
    <main className="flex-grow bg-background">
      <SubscriptionSuccessModal
        open={callbackSuccess && isSubscribed}
        subscriptionId={subscriptionId ?? undefined}
      />
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-10 sm:px-6 md:py-12">

        {justSubscribed && !isSubscribed && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full tint-info">
              <AnimatedIcon name="hourglass_top" size={24} className="text-accent-terminal" aria-hidden />
            </span>
            <p className="text-[16px] font-semibold text-on-surface">Payment received. Activating your Pro…</p>
            <p className="max-w-sm text-[14px] text-on-surface-variant">
              We&apos;re syncing your subscription with Dodo. This usually takes a few seconds.
            </p>
            <SubscriptionActivator
              subscriptionId={subscriptionId}
              status={searchParams.status ?? null}
              isSubscribed={isSubscribed}
              autoActivate
            />
          </div>
        )}

        {searchParams.from === "radar_limit" && !isSubscribed ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-center">
            <p className="text-[14px] font-semibold text-on-surface">You&apos;ve hit the free 3-stock limit</p>
            <p className="mt-1 text-[13px] text-on-surface-variant">
              Upgrade to Pro to track every name you hold, or remove a stock on Radar first.
            </p>
          </div>
        ) : null}

        <SubscribePricing
          isSubscribed={isSubscribed}
          justSubscribed={callbackSuccess}
          market={market}
          trackedCount={
            Array.isArray(userDoc?.tracked_stocks) ? userDoc.tracked_stocks.length : 0
          }
        />

        {!isSubscribed ? (
          <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-[10px] text-on-surface-variant">
            {trustItems.map(({ icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5">
                <AnimatedIcon name={icon} size={15} aria-hidden />
                {text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
