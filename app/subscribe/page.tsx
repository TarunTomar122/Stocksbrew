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

  // Vercel injects x-vercel-ip-country on every request — use it for automatic
  // geo-detection. Falls back to "US" in local dev where the header isn't present.
  const headerStore = await headers();
  const ipCountry = headerStore.get("x-vercel-ip-country") ?? "";
  const market: "US" | "IN" = ipCountry === "IN" ? "IN" : "US";

  return (
    <main className="flex-grow">
      <SubscriptionSuccessModal
        open={callbackSuccess && isSubscribed}
        subscriptionId={subscriptionId ?? undefined}
      />
      <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-12 px-6 md:px-10 lg:px-16 py-16 md:py-24">

        {justSubscribed && !isSubscribed && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff]">
              <span
                className="material-symbols-outlined text-[#0052ff]"
                style={{ fontSize: 24, fontVariationSettings: "'wght' 600" }}
              >
                hourglass_top
              </span>
            </span>
            <p className="text-[16px] font-semibold text-[#111111]">Payment received. Activating your Pro…</p>
            <p className="text-[14px] text-[#6b7280] max-w-sm">
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

        <SubscribePricing
          isSubscribed={isSubscribed}
          justSubscribed={callbackSuccess}
          market={market}
        />

        {/* Trust row */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-[12px] text-[#9ca3af]">
          {[
            { icon: "lock", text: "Secure checkout via Dodo Payments" },
            { icon: "cancel", text: "Cancel anytime" },
            { icon: "support_agent", text: "tomartarun2001@gmail.com" },
          ].map(({ icon, text }) => (
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
      </div>
    </main>
  );
}
