"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { PRO_LOCKED_FEED_TEASER } from "@/lib/pro-features";
import {
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import { ProCtaButton } from "@/components/pro-cta";
import { StockLogo } from "@/components/stock-logo";
import { signInWithGoogle } from "@/lib/sign-in";

type Benefit = {
  icon: string;
  title: string;
  body: string;
};

const BENEFITS: Benefit[] = [
  {
    icon: "query_stats",
    title: "EPS call",
    body: "Beat, miss, or inline — before the number drops.",
  },
  {
    icon: "trending_up",
    title: "Post-print move",
    body: "How the stock is likely to trade after earnings.",
  },
  {
    icon: "rule",
    title: "What to do",
    body: "Act, hold, or stay out — with the reasoning.",
  },
  {
    icon: "verified",
    title: "Confidence score",
    body: "How strong each setup is, so you know what to trust.",
  },
];

type Props = {
  setupCount: number;
  tickers: string[];
};

const EXAMPLE_SETUPS: Record<
  string,
  {
    name: string;
    sector: string;
    price: string;
    change: string;
    changeUp: boolean;
    reportLabel: string;
    daysLabel: string;
    headline: string;
    summary: string;
    epsLabel: string;
    epsDetail: string;
    moveLabel: string;
    moveDetail: string;
    holders: string;
    watchers: string;
    monitors: string[];
    confidence: number;
  }
> = {
  ADBE: {
    name: "Adobe Inc.",
    sector: "Software",
    price: "$525.40",
    change: "+0.82%",
    changeUp: true,
    reportLabel: "Reports Mar 12",
    daysLabel: "In 4 days",
    headline: "Creative Cloud resilience should clear a conservative guide",
    summary:
      "Enterprise renewals are holding and AI add-ons are layering on ARR faster than the street models. The setup favors a modest beat with a relief rally if management raises FY outlook.",
    epsLabel: "Beat likely",
    epsDetail: "Street is still anchoring to a soft quarter; our read says upside on net new ARR.",
    moveLabel: "Rally after print",
    moveDetail: "Multiple has compressed into the print — a clean guide raise could re-rate the name.",
    holders: "Hold into the print; trim only if guidance comes in flat with no AI uplift.",
    watchers: "Wait for the guide — a beat without FY raise is a sell-the-news setup.",
    monitors: ["FY net new ARR", "GenAI monetization", "EMEA renewal rate"],
    confidence: 78,
  },
};

const GENERIC_EXAMPLE = {
  name: "Company name",
  sector: "Sector",
  price: "$142.50",
  change: "+1.24%",
  changeUp: true,
  reportLabel: "Reports this week",
  daysLabel: "In 3 days",
  headline: "Setup favors a beat with a modest post-print move",
  summary:
    "Our read pulls together consensus positioning, recent guide tone, and how the stock has traded into the print.",
  epsLabel: "Beat likely",
  epsDetail: "Street estimates look beatable based on recent demand signals and management tone.",
  moveLabel: "Rally after print",
  moveDetail: "The name has drifted into the print — a clean beat could trigger a relief move.",
  holders: "Hold into the print unless you are already overweight into a binary event.",
  watchers: "Wait for the guide; a beat without a raise is often a sell-the-news setup.",
  monitors: ["Revenue guide", "Margin outlook", "Next-quarter setup"],
  confidence: 82,
};

function MockSetupCard({ ticker }: { ticker: string }) {
  const example = EXAMPLE_SETUPS[ticker] ?? { ...GENERIC_EXAMPLE, headline: `${ticker} before the print` };

  return (
    <div
      aria-hidden
      className="flex h-full flex-col gap-4 rounded-[20px] border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-[#fff7ed] p-4 shadow-[0_12px_40px_rgba(180,83,9,0.08)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={ticker} market="US" size={36} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111]">
              {ticker}
            </span>
            <span className="truncate text-[11px] text-[#9ca3af]">{example.name}</span>
            <span className="truncate text-[10px] font-medium text-[#9ca3af]">{example.sector}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[12px] font-semibold tabular-nums text-[#111111]">{example.price}</span>
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: example.changeUp ? "#047857" : "#b91c1c" }}
          >
            {example.change}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#6b7280]">
        <span className="font-semibold text-[#92400e]">Before earnings</span>
        <span>{example.reportLabel}</span>
        <span className="font-semibold text-[#b45309]">{example.daysLabel}</span>
        <span className="tabular-nums font-semibold text-[#111111]">{example.confidence}% confidence</span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="rounded-xl border border-[#10b981] bg-white/90 px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
            EPS prediction
          </span>
          <span className="text-[15px] font-semibold leading-snug text-[#047857]">{example.epsLabel}</span>
          <span className="text-[11px] leading-snug text-[#6b7280]">{example.epsDetail}</span>
        </div>
        <div className="rounded-xl border border-[#2563eb] bg-white/90 px-3 py-2.5 flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
            Stock prediction
          </span>
          <span className="text-[15px] font-semibold leading-snug text-[#1d4ed8]">{example.moveLabel}</span>
          <span className="text-[11px] leading-snug text-[#6b7280]">{example.moveDetail}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-[#111111]">
          {example.headline}
        </h3>
        <p className="text-[12px] leading-relaxed text-[#374151]">{example.summary}</p>
      </div>

      <div className="rounded-xl border border-[#e5e7eb] bg-white/90 p-3 flex flex-col gap-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#111111]">What to do</p>
        <div>
          <p className="text-[10px] font-semibold text-[#6b7280]">If you hold</p>
          <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-[#111111]">{example.holders}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[#6b7280]">If you are watching</p>
          <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-[#111111]">{example.watchers}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">Watch on the call</p>
        <div className="flex flex-wrap gap-1.5">
          {example.monitors.map((item) => (
            <span
              key={item}
              className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#374151] ring-1 ring-[#e5e7eb]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UpcomingEarningsPaywall({ setupCount, tickers }: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackPaywallShown({
      surface: "upcoming_earnings",
      signedIn: Boolean(user),
    });
  }, [user]);

  async function handleUnlock() {
    trackPaywallUnlockClicked({
      surface: "upcoming_earnings",
      signedIn: Boolean(user),
    });
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle({ surface: "paywall" });
        router.push("/subscribe");
      } catch (err) {
        console.error("sign-in failed", err);
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  const reportingLine =
    setupCount > 0
      ? `${setupCount} ${setupCount === 1 ? "company" : "companies"} reporting in the next 7 days`
      : "Fresh setups added as names enter the 7-day window";

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] via-white to-[#fff7ed]">
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6 p-6 md:p-8 lg:p-10">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#92400e]">
              <span aria-hidden>★</span> stocksbrew Pro
            </span>
            <h2 className="text-[26px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight md:text-[32px]">
              Know the setup before the print
            </h2>
            <p className="max-w-[520px] text-[15px] leading-relaxed text-[#374151]">
              {reportingLine}. Pro unlocks {PRO_LOCKED_FEED_TEASER} AI pre-earnings setups with our EPS
              call, expected move, and what to do on each name.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="flex gap-3 rounded-2xl border border-[#fde68a]/60 bg-white/80 px-4 py-3"
              >
                <AnimatedIcon name={benefit.icon} size={20} className="mt-0.5 shrink-0 text-[#b45309]" aria-hidden />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-[#111111]">{benefit.title}</span>
                  <span className="text-[12px] leading-snug text-[#6b7280]">{benefit.body}</span>
                </div>
              </div>
            ))}
          </div>

          {tickers.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                Reporting soon
              </p>
              <div className="flex flex-wrap gap-2">
                {tickers.slice(0, 14).map((ticker) => (
                  <span
                    key={ticker}
                    className="inline-flex rounded-full border border-[#fde68a] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#92400e]"
                  >
                    {ticker}
                  </span>
                ))}
                {tickers.length > 14 ? (
                  <span className="inline-flex rounded-full border border-dashed border-[#d1d5db] bg-[#fafafa] px-2.5 py-1 text-[12px] font-semibold text-[#6b7280]">
                    {PRO_LOCKED_FEED_TEASER} more
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 pt-1 sm:max-w-[320px]">
            <ProCtaButton type="button" disabled={busy} onClick={handleUnlock} fullWidth showStar>
              {busy ? "Signing you in…" : user ? "Choose Pro" : "Start your 3-day free trial"}
              {!busy && <span aria-hidden>→</span>}
            </ProCtaButton>
            <span className="text-center text-[11px] font-medium text-[#9ca3af] sm:text-left">
              3 days free on monthly or yearly. Cancel anytime.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-[#fafafa]/60 p-6 md:p-8 lg:p-10">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
              Example setup card
            </p>
            <p className="text-[13px] text-[#6b7280]">
              Every reporting name gets a read like this — updated through the week.
            </p>
          </div>
          <MockSetupCard ticker={tickers[0] ?? "ADBE"} />
        </div>
      </div>
    </section>
  );
}
