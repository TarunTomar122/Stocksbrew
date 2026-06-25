import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { SubscribePricing } from "@/components/subscribe-pricing";
import { SubscriptionSuccessModal } from "@/components/subscription-success-modal";
import { SubscriptionActivator } from "@/components/subscription-activator";

export const metadata: Metadata = {
  title: "Pricing & Plans",
  description: "Unlock Pro for unlimited Radar stocks, personalized buy/hold/sell calls, full scorecards, and email alerts when stocks hit buy or sell zones. Free for 3 stocks.",
  alternates: { canonical: "/subscribe" },
  openGraph: {
    title: "stocksbrew Pro - Pricing & Plans",
    description: "Unlimited Radar, research-backed calls, price triggers, and email alerts when setups change.",
    url: "https://www.stocksbrew.online/subscribe",
  },
  twitter: {
    title: "stocksbrew Pro - Pricing & Plans",
    description: "Unlimited Radar, research-backed calls, price triggers, and email alerts when setups change.",
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
    { icon: "lock", text: "Secure checkout via Dodo Payments" },
    { icon: "cancel", text: "Cancel anytime" },
    ...(session?.email
      ? [{ icon: "support_agent", text: session.email }]
      : [{ icon: "login", text: "Sign in to subscribe" }]),
  ];

  return (
    <main className="flex-grow bg-background">
      <SubscriptionSuccessModal
        open={callbackSuccess && isSubscribed}
        subscriptionId={subscriptionId ?? undefined}
      />
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8 px-4 py-12 sm:px-6 md:py-16">

        {justSubscribed && !isSubscribed && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full tint-info">
              <span
                className="material-symbols-outlined text-accent-terminal"
                style={{ fontSize: 24, fontVariationSettings: "'wght' 600" }}
              >
                hourglass_top
              </span>
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
              Upgrade to Pro to track every name you hold — or remove a stock on Radar first.
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
          <div className="flex flex-wrap items-center justify-center gap-5 font-mono text-[11px] text-on-surface-variant">
            {trustItems.map(({ icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 15, fontVariationSettings: "'wght' 500" }}
                  aria-hidden
                >
                  {icon}
                </span>
                {text}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
