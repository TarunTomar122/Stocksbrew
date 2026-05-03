"use client";

import { useEffect, useMemo, useState } from "react";

import { StockAiDecisionCarousel } from "@/components/stock-ai-decision-carousel";
import { StrategicDirectiveDemo } from "@/components/strategic-directive";
import { SignalTileCard, type SignalTileModel } from "@/components/signal-tile";
import type { Directive } from "@/lib/stock";

/** Landing-only sample — matches AI tab `Directive` shape; not generated live. */
const LANDING_DEMO_DIRECTIVE: Directive = {
  text: "Lean into NVDA into the next data-center print — supply commentary still leaves room vs. margin expectations.",
  stance: "accumulate",
  trigger_type: "none",
  rationale:
    "Growth and momentum pillars lead the scorecard; valuation is the friction the model weighs into the catalyst window.",
  confidence: "med",
};

type ValueProp = {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  body: string;
};

const VALUE_PROPS: ValueProp[] = [
  {
    icon: "stacked_bar_chart",
    iconBg: "#eff6ff",
    iconFg: "#0052ff",
    title: "Numbers into pillars",
    body: "Tikrr reads the fundamentals and surfaces key insights into four pillars that you can skim on the scorecard.",
  },
  {
    icon: "mark_email_read",
    iconBg: "#ecfdf5",
    iconFg: "#047857",
    title: "Pinged when something moves",
    body: "Breakouts, RSI extremes, earnings windows, and score shifts can hit your inbox when they trip on your Radar.",
  },
  {
    icon: "schedule",
    iconBg: "#fef3c7",
    iconFg: "#92400e",
    title: "AI runs twice daily",
    body: "Morning and after-close passes re-read news and filings against your list so Overview tiles and AI briefs stay current. WhatsApp delivery is on the way.",
  },
];

/** Static tiles shaped like live `SignalDeck` output (labels + headline math match the real generators). */
const OVERVIEW_DEMO_TILES: SignalTileModel[] = [
  {
    emoji: "🎯",
    bg: "#eff6ff",
    label: "Analyst target",
    headline: "+14.2%",
    supporting: "Target $195 ·   42 analysts",
    tone: "up",
  },
  {
    emoji: "🔥",
    bg: "#fef3c7",
    label: "RSI stretched",
    headline: "73",
    supporting: "Pullback risk",
    tone: "warn",
  },
  {
    emoji: "🚀",
    bg: "#eff6ff",
    label: "Strong momentum",
    headline: "82",
    supporting: "Top pillar",
    tone: "up",
  },
  {
    emoji: "📅",
    bg: "#fef3c7",
    label: "Next earnings",
    headline: "May 6",
    supporting: "Watch for guide",
    tone: "warn",
  },
  {
    emoji: "💰",
    bg: "#ecfdf5",
    label: "Revenue YoY",
    headline: "+18.4%",
    supporting: "Solid growth tape",
    tone: "up",
  },
  {
    emoji: "🏛️",
    bg: "#f3f4f6",
    label: "Institutional",
    headline: "74.2%",
    supporting: "Footprint of total float",
    tone: "ink",
  },
];

export function ProLandingAiStrip() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const track = useMemo(() => OVERVIEW_DEMO_TILES, []);

  return (
    <section className="flex flex-col gap-6 bg-white p-6 md:p-8 shadow-[0_18px_50px_rgba(17,24,39,0.04)]">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {VALUE_PROPS.map((v) => (
          <article
            key={v.title}
            className="flex flex-col gap-4 rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{ background: v.iconBg, color: v.iconFg }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 22, fontVariationSettings: "'wght' 600" }}
                >
                  {v.icon}
                </span>
              </span>
            </div>
            <h4 className="text-[18px] font-semibold tracking-[-0.01em] text-[#111111] leading-snug">
              {v.title}
            </h4>
            <p className="text-[14px] leading-relaxed text-[#6b7280]">{v.body}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-4">
  
      <p className="text-[12px] text-[#9ca3af] text-center">demo component - not live data 👇</p>

        <StrategicDirectiveDemo ticker="NVDA" directive={LANDING_DEMO_DIRECTIVE} />
        <StockAiDecisionCarousel ticker="NVDA" intelPro={null} />
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] bg-[#fafafa] p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">Surfaces key insights from fundamentals</h3>
          <span className="text-[12px] text-[#6b7280]">Overview · sample figures</span>
        </div>


          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            {track.map((s, i) => (
              <SignalTileCard key={`${s.label}-${i}`} signal={s} />
            ))}
          </div>
    
      </div>
    </section>
  );
}
