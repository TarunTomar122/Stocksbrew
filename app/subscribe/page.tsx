import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { SubscribePricing } from "@/components/subscribe-pricing";
import { SubscriptionSuccessModal } from "@/components/subscription-success-modal";
import { MARKET_COOKIE } from "@/lib/market";

export const metadata: Metadata = {
  title: "Pricing & Plans",
  description: "Unlock Pro access to AI-powered stock briefs, full scorecards, analyst consensus, institutional flows, and personalized Radar alerts. Free and Pro plans available.",
  alternates: { canonical: "/subscribe" },
  openGraph: {
    title: "tikrr Pro - Pricing & Plans",
    description: "Unlock AI-powered stock briefs, full scorecards, analyst consensus, institutional flows, and personalized Radar alerts.",
    url: "https://www.tikrr.online/subscribe",
  },
  twitter: {
    title: "tikrr Pro - Pricing & Plans",
    description: "Unlock AI-powered stock briefs, full scorecards, analyst consensus, institutional flows, and personalized Radar alerts.",
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
  const callbackSuccess = searchParams.success === "1" || searchParams.status === "active";
  const justSubscribed = callbackSuccess || isSubscribed;

  const cookieStore = await cookies();
  const marketCookie = cookieStore.get(MARKET_COOKIE)?.value;
  const market: "US" | "IN" = marketCookie === "IN" ? "IN" : "US";

  return (
    <main className="flex-grow">
      <SubscriptionSuccessModal
        open={callbackSuccess}
        subscriptionId={searchParams.subscription_id}
      />
      <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-12 px-6 md:px-10 lg:px-16 py-16 md:py-24">

        {justSubscribed && !isSubscribed && (
          /* Webhook hasn't fired yet - show a pending state */
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff]">
              <span
                className="material-symbols-outlined text-[#0052ff]"
                style={{ fontSize: 24, fontVariationSettings: "'wght' 600" }}
              >
                hourglass_top
              </span>
            </span>
            <p className="text-[16px] font-semibold text-[#111111]">Payment received - activating your Pro…</p>
            <p className="text-[14px] text-[#6b7280] max-w-sm">
              This usually takes a few seconds. Refresh the page if it doesn&apos;t update automatically.
            </p>
          </div>
        )}

        <SubscribePricing isSubscribed={isSubscribed} market={market} />

        {/* Trust row */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-[12px] text-[#9ca3af]">
          {[
            { icon: "lock", text: "Secure checkout via Dodo Payments" },
            { icon: "cancel", text: "Cancel anytime" },
            { icon: "support_agent", text: "hello@tikrr.com" },
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
