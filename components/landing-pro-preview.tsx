import { AnimatedIcon } from "@/components/animated-icon";
import { LandingProPricingCta } from "@/components/landing-pro-pricing-cta";
import { US_PRO_MONTHLY_LABEL, US_PRO_YEARLY_LABEL, US_YEARLY_SAVE_PCT } from "@/lib/pricing";

type Props = {
  isSignedIn: boolean;
  isSubscribed: boolean;
};

type Feature = {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  body: string;
};

const FEATURES: Feature[] = [
  {
    icon: "verified",
    iconBg: "#eff6ff",
    iconFg: "#0052ff",
    title: "The call",
    body: "Buy, hold, sell, or watch. Not another score to decode.",
  },
  {
    icon: "bolt",
    iconBg: "#fff7ed",
    iconFg: "#ea580c",
    title: "The reason",
    body: "Why a stock moved, what changed, and what matters next.",
  },
  {
    icon: "hub",
    iconBg: "#fef3c7",
    iconFg: "#92400e",
    title: "Your book",
    body: "Where you are crowded, what you are missing, and which names deserve attention.",
  },
];

export const PRO_BULLETS = [
  "Calls on every Watchlist stock",
  "Why big moves happened",
  "Reddit and news read for you",
  "Portfolio crowding and gaps",
  "Earnings setups before the print",
  "Cancel anytime",
];

export function LandingProPreview({ isSignedIn, isSubscribed }: Props) {
  if (isSignedIn && isSubscribed) return null;

  const ctaLabel = "Start your 3-day free trial";

  return (
    <section className="flex flex-col gap-16">
      <div className="flex flex-col gap-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0052ff]">
            stocksbrew Pro
          </span>
          <h2 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#111111] md:text-[38px]">
            Know what to do with the stocks you care about.
          </h2>
          <p className="max-w-lg text-[15px] leading-relaxed text-[#6b7280]">
            stocksbrew reads the price action, news, earnings, Reddit chatter, and fundamentals,
            then gives you the call in plain English.
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-[920px] grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#111111] md:text-[40px]">
            Pick the plan that fits.
          </h2>
        </div>

        <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 gap-5 md:grid-cols-2">
          <PricingCard
            tag="Monthly"
            price={US_PRO_MONTHLY_LABEL}
            period="/ month"
            trial={`3 days free, then ${US_PRO_MONTHLY_LABEL}/mo`}
            isSignedIn={isSignedIn}
            ctaLabel={ctaLabel}
          />
          <PricingCard
            tag="Yearly"
            price={US_PRO_YEARLY_LABEL}
            period="/ year"
            save={`Save ${US_YEARLY_SAVE_PCT}%`}
            trial={`3 days free, then ${US_PRO_YEARLY_LABEL}/yr`}
            highlight
            isSignedIn={isSignedIn}
            ctaLabel={ctaLabel}
          />
        </div>
      </div>
    </section>
  );
}

function PricingCard({
  tag,
  price,
  period,
  save,
  trial,
  note,
  highlight,
  isSignedIn,
  ctaLabel,
}: {
  tag: string;
  price: string;
  period: string;
  save?: string;
  trial?: string;
  note?: string;
  highlight?: boolean;
  isSignedIn: boolean;
  ctaLabel: string;
}) {
  return (
    <article
      className={`relative flex flex-col gap-5 rounded-[28px] border bg-white p-7 shadow-[0_18px_50px_rgba(17,24,39,0.04)] md:p-8 ${
        highlight ? "border-[#111111] shadow-[0_24px_70px_rgba(17,24,39,0.10)]" : "border-[#e5e7eb]"
      }`}
    >
      {highlight ? (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center rounded-full bg-[#111111] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
          Best value
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
          {tag}
        </span>
        {save ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#10b981]">
            {save}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[48px] font-semibold leading-none tracking-[-0.03em] text-[#111111] md:text-[56px]">
          {price}
        </span>
        <span className="text-[16px] font-medium text-[#6b7280]">{period}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {PRO_BULLETS.map((line) => (
          <li key={line} className="flex items-start gap-2 text-[13px] text-[#374151]">
            <AnimatedIcon name="check_circle" size={18} className="mt-0.5 text-[#10b981]" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2 border-t border-[#f3f4f6] pt-2">
        {trial ? (
          <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#d1fae5] py-2 text-[12px] font-semibold text-[#065f46]">
            {trial}
          </span>
        ) : note ? (
          <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f3f4f6] py-2 text-[12px] font-semibold text-[#6b7280]">
            {note}
          </span>
        ) : null}
        <LandingProPricingCta isSignedIn={isSignedIn} highlight={highlight} ctaLabel={ctaLabel} />
        <span className="text-center text-[11px] font-medium text-[#9ca3af]">
          Cancel anytime
        </span>
      </div>
    </article>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7">
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-2xl"
        style={{ background: feature.iconBg, color: feature.iconFg }}
      >
        <AnimatedIcon name={feature.icon} size={22} aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="text-[20px] font-semibold leading-snug tracking-[-0.02em] text-[#111111]">
          {feature.title}
        </h3>
        <p className="text-[14px] leading-relaxed text-[#6b7280]">{feature.body}</p>
      </div>
    </article>
  );
}
