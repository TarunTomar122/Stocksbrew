import { LandingProPricingCta } from "@/components/landing-pro-pricing-cta";

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

// The interpretation layer, framed as "what happens when we point it at your stocks."
const FEATURES: Feature[] = [
  {
    icon: "verified",
    iconBg: "#eff6ff",
    iconFg: "#0052ff",
    label: "The call",
    title: "A verdict on every name, with the reasoning",
    body: "Buy, hold, sell, or watch on each stock you track. Not a score you have to interpret. The actual call, and why.",
    example: "NVDA: trim into strength above $220. Valuation rich, momentum fading.",
  },
  {
    icon: "monitoring",
    iconBg: "#f0fdf4",
    iconFg: "#16a34a",
    label: "Before the print",
    title: "Our read on earnings before they report",
    body: "We call the beat or miss and how the stock reacts, before the number drops. Then we show you if we were right.",
    example: "HPE: EPS beat likely, setup bullish. Reported, stock rose 30%.",
  },
  {
    icon: "hub",
    iconBg: "#fef3c7",
    iconFg: "#92400e",
    label: "The whole book",
    title: "What your portfolio is really exposed to",
    body: "Concentration, overlapping bets, and the gap you cannot see. We read the book, not just the tickers.",
    example: "67% in Technology. One rate shock hits all of it at once.",
  },
  {
    icon: "sensors",
    iconBg: "#fef2f2",
    iconFg: "#dc2626",
    label: "The signal",
    title: "Anomalies and Reddit, read for you",
    body: "When a name you track moves on something real, or the crowd turns, you hear what it means in plain language.",
    example: "ZS down 6%. Growth outlook cut, analyst downgrade. Not noise.",
  },
];

// One contrast block. Other apps stop at data; stocksbrew adds the judgment.
const DATA_SIDE = [
  "Price charts and candlesticks",
  "P/E, market cap, revenue tables",
  "A news headline list you scroll",
  "You do the thinking",
];

const JUDGMENT_SIDE = [
  "A clear call on every stock: buy, hold, sell, watch",
  "EPS predictions before the print, with a track record",
  "Anomalies and Reddit chatter read and explained",
  "Sector regime: what is rotating, what is heating up",
];

export function LandingProPreview({ isSignedIn, isSubscribed }: Props) {
  if (isSignedIn && isSubscribed) return null;

  const ctaLabel = isSignedIn ? "Subscribe - $9/mo" : "Sign in & start free";

  return (
    <section className="flex flex-col gap-20">
      {/* Category: data vs judgment */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center max-w-2xl mx-auto">
          <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#0052ff]">
            Why stocksbrew
          </span>
          <h2 className="text-[28px] md:text-[38px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.1]">
            The numbers are everywhere. The judgment is not.
          </h2>
          <p className="text-[15px] leading-relaxed text-[#6b7280] max-w-lg">
            Every broker and finance app hands you the same data. None of them tell you what to do with it.
            That is the part we built.
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-[820px] grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-3xl border border-[#e5e7eb] bg-[#fafafa] p-6 md:p-7">
            <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
              Every other app
            </span>
            <ul className="flex flex-col gap-2.5">
              {DATA_SIDE.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[14px] text-[#6b7280]">
                  <span
                    aria-hidden
                    className="material-symbols-outlined text-[#9ca3af] mt-0.5"
                    style={{ fontSize: 18 }}
                  >
                    remove
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border-2 border-[#111111] bg-white p-6 md:p-7 shadow-[0_18px_50px_rgba(17,24,39,0.06)]">
            <span className="text-[12px] font-semibold tracking-[0.08em] uppercase text-[#0052ff]">
              stocksbrew
            </span>
            <ul className="flex flex-col gap-2.5">
              {JUDGMENT_SIDE.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[14px] font-medium text-[#111111]">
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
          </div>
        </div>
      </div>

      {/* Point it at your stocks */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center max-w-2xl mx-auto">
          <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#0052ff]">
            stocksbrew Pro
          </span>
          <h2 className="text-[28px] md:text-[38px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.1]">
            Point all of that at the stocks you actually own.
          </h2>
          <p className="text-[15px] leading-relaxed text-[#6b7280] max-w-lg">
            Free shows you stocksbrew thinking about the market. Pro turns it on your watchlist and your portfolio.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <FeatureCard key={f.label} feature={f} />
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.1] text-center">
            Try it free for 3 days.
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fef3c7] px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#92400e]">
            <span aria-hidden>🚀</span>
            Launch-week pricing
          </span>
        </div>

        <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 md:grid-cols-2 gap-5">
          <PricingCard
            tag="Monthly"
            price="$9"
            period="/ month"
            strike="$12"
            save="Save 25%"
            trial="3 days free, then $9/mo"
            isSignedIn={isSignedIn}
            ctaLabel={ctaLabel}
          />
          <PricingCard
            tag="Yearly"
            price="$99"
            period="/ year"
            strike="$144"
            save="Save 31%"
            trial="3 days free, then $99/yr"
            highlight
            isSignedIn={isSignedIn}
            ctaLabel={ctaLabel}
          />
        </div>
      </div>
    </section>
  );
}

export const PRO_BULLETS = [
  "Unlimited stocks on your Radar (free is capped at 3)",
  "A clear call on every stock: buy, hold, sell, or watch, with the reasoning",
  "Pre-earnings setups: our read before the print, with the track record",
  "Portfolio diagnosis: concentration, overlap, and the gaps you cannot see",
  "Anomalies, Reddit buzz, and email alerts when something moves",
  "Cancel anytime, one click, no questions asked",
];

function PricingCard({
  tag,
  price,
  period,
  strike,
  save,
  trial,
  highlight,
  isSignedIn,
  ctaLabel,
}: {
  tag: string;
  price: string;
  period: string;
  strike: string;
  save: string;
  trial: string;
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
        <span className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#d1fae5] py-2 text-[12px] font-semibold text-[#065f46]">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="6.5" fill="#10b981" fillOpacity="0.2"/>
            <path d="M3.5 6.5l2 2 4-4" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {trial}
        </span>
        <LandingProPricingCta isSignedIn={isSignedIn} highlight={highlight} ctaLabel={ctaLabel} />
        <span className="text-[11px] font-medium text-[#9ca3af] text-center">
          Cancel anytime, no questions asked
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
