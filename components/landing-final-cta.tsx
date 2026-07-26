import { LandingProPricingCta } from "@/components/landing-pro-pricing-cta";

export function LandingFinalCta({
  isSignedIn,
  isSubscribed,
}: {
  isSignedIn: boolean;
  isSubscribed: boolean;
}) {
  if (isSignedIn && isSubscribed) return null;

  const ctaLabel = isSignedIn ? "Start 3-day free trial" : "Sign in to start free trial";

  return (
    <section className="mx-auto w-full max-w-[760px] rounded-[32px] border border-[#e5e7eb] bg-[#0a0a0a] px-6 py-12 md:px-12 md:py-16 text-center">
      <h2 className="text-[28px] md:text-[40px] font-semibold tracking-[-0.02em] text-white leading-[1.1]">
        Stop guessing what to do with your stocks.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#9ca3af]">
        Point stocksbrew at your watchlist and get a clear call on every name, with the reasoning behind it.
      </p>
      <div className="mx-auto mt-7 max-w-[280px]">
        {/* white-button variant (highlight=false) so it reads on the dark panel */}
        <LandingProPricingCta
          isSignedIn={isSignedIn}
          ctaLabel={ctaLabel}
          surface="landing_final_cta"
        />
      </div>
      <p className="mt-3 text-[11px] font-medium text-[#6b7280]">
        3 days free on monthly or yearly. Cancel anytime. Not investment advice.
      </p>
    </section>
  );
}
