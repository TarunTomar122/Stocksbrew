import { LandingProPricingCta } from "@/components/landing-pro-pricing-cta";
import { ProLandingAiStrip } from "@/components/pro-landing-ai-strip";

type Props = {
  isSignedIn: boolean;
  isSubscribed: boolean;
};

type Feature = {
  icon: string;
  iconBg: string;
  iconFg: string;
  label: string;
  title: string;
  body: string;
  example: string;
};

const FEATURES: Feature[] = [
  {
    icon: "visibility_off",
    iconBg: "#fef3c7",
    iconFg: "#92400e",
    label: "Blind spot",
    title: "Spot what you’re over-exposed to",
    body: "Sector and theme clusters so concentration doesn’t sneak up on you.",
    example: "“67% in Technology — add a defensive.”",
  },
  {
    icon: "event",
    iconBg: "#eff6ff",
    iconFg: "#0052ff",
    label: "Tomorrow",
    title: "Earnings + rating moves in one lane",
    body: "Earnings dates, ratings, RSI, volume — rescored on every run.",
    example: "“PLTR earnings May 4 · NVDA RSI 78.”",
  },
  {
    icon: "compare_arrows",
    iconBg: "#ecfdf5",
    iconFg: "#047857",
    label: "Refresh delta",
    title: "Only what changed since last refresh",
    body: "Scores, alerts, and news velocity vs the last refresh — movement only.",
    example: "“GOOGL score +3.2 · target +37% this week.”",
  },
  {
    icon: "notifications_active",
    iconBg: "#fef2f2",
    iconFg: "#dc2626",
    label: "Live alerts",
    title: "Email pings the second a signal fires",
    body: "Breakouts, RSI extremes, targets, earnings windows — email when they trip. WhatsApp delivery soon.",
    example: "“AMD broke out — email sent at 09:42 ET.”",
  },
];

export function LandingProPreview({ isSignedIn, isSubscribed }: Props) {
  if (isSignedIn && isSubscribed) return null;

  const ctaLabel = isSignedIn ? "Subscribe — $9/mo" : "Sign in & start free";

  return (
    <section className="flex flex-col gap-10">
      {/* Headline */}
      <div className="flex flex-col items-center gap-3 text-center max-w-3xl mx-auto">
        <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#0052ff]">
          Pro · what you unlock
        </span>
        <h2 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.1]">
          Your Radar for the tickers you care about.
          <br />
          <span className="text-[#6b7280]">
            Pillar scorecards, alerts, twice-daily AI.
          </span>
        </h2>
        <p className="text-[15px] md:text-[16px] leading-relaxed text-[#374151] max-w-2xl">
          Follow names on Radar with pillar reads—including the stock scorecard—email
          alerts when signals move, WhatsApp soon, and twice-daily AI passes on what changed
          for your list.
        </p>
      </div>

      <ProLandingAiStrip />

      {/* Feature grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((f) => (
          <FeatureCard key={f.label} feature={f} />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 mt-12">
        <h2 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.1] text-center">
          Cheaper than a coffee.
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#92400e]">
          <span aria-hidden>🚀</span>
          Launch-week pricing
        </span>
      </div>

      {/* Pricing — monthly + yearly side by side */}
      <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 md:grid-cols-2 gap-5">
        <PricingCard
          tag="Monthly"
          price="$9"
          period="/ month"
          strike="$12"
          save="Save 25%"
          isSignedIn={isSignedIn}
          ctaLabel={ctaLabel}
        />
        <PricingCard
          tag="Yearly"
          price="$99"
          period="/ year"
          strike="$144"
          save="Save 31%"
          highlight
          isSignedIn={isSignedIn}
          ctaLabel={ctaLabel}
        />
      </div>

    </section>
  );
}

const PRO_BULLETS = [
  "Unlimited personal AI-tier stocks",
  "Twice-daily news-backed briefs",
  "Radar concentration & blind-spot alerts",
  "Full heat list, divergences, and screens",
  "Refresh deltas — only the new signal",
  "Email + (soon) WhatsApp pings on your Radar",
];

function PricingCard({
  tag,
  price,
  period,
  strike,
  save,
  highlight,
  isSignedIn,
  ctaLabel,
}: {
  tag: string;
  price: string;
  period: string;
  strike: string;
  save: string;
  highlight?: boolean;
  isSignedIn: boolean;
  ctaLabel: string;
}) {
  return (
    <article
      className={`relative flex flex-col gap-5 rounded-[28px] border bg-white p-7 md:p-8 shadow-[0_18px_50px_rgba(17,24,39,0.04)] ${
        highlight ? "border-[#111111] shadow-[0_24px_70px_rgba(17,24,39,0.10)]" : "border-[#e5e7eb]"
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-[#111111] px-3 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-white">
          Best value
        </span>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
          {tag}
        </span>
        <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#10b981]">
          {save}
        </span>
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[48px] md:text-[56px] font-semibold tracking-[-0.03em] text-[#111111] leading-none">
          {price}
        </span>
        <span className="text-[16px] font-medium text-[#6b7280]">{period}</span>
        <span className="text-[15px] font-medium text-[#9ca3af] line-through tabular-nums">
          {strike}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {PRO_BULLETS.map((line) => (
          <li
            key={line}
            className="flex items-start gap-2 text-[13px] text-[#374151]"
          >
            <span
              aria-hidden
              className="material-symbols-outlined text-[#10b981] mt-0.5"
              style={{ fontSize: 18, fontVariationSettings: "'wght' 600" }}
            >
              check_circle
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 pt-2 border-t border-[#f3f4f6] mt-auto">
        <LandingProPricingCta isSignedIn={isSignedIn} highlight={highlight} ctaLabel={ctaLabel} />
        <span className="text-[11px] font-medium text-[#9ca3af] text-center">
          Cancel anytime · one click
        </span>
      </div>
    </article>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7">
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: feature.iconBg, color: feature.iconFg }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 22, fontVariationSettings: "'wght' 600" }}
          >
            {feature.icon}
          </span>
        </span>
        <span className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] uppercase text-[#6b7280]">
          {feature.label}
        </span>
      </div>

      <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#111111] leading-snug">
        {feature.title}
      </h3>
      <p className="text-[14px] leading-relaxed text-[#6b7280]">{feature.body}</p>

      <div
        className="mt-1 rounded-xl px-3 py-2.5 text-[12px] font-medium leading-snug"
        style={{ background: `${feature.iconBg}80`, color: feature.iconFg }}
      >
        {feature.example}
      </div>
    </article>
  );
}
