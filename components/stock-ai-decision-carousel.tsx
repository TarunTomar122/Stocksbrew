"use client";

import { useEffect, useMemo, useState } from "react";

import type { StockIntelPro } from "@/lib/types";

type Slide = {
  id: string;
  verb: string;
  line: string;
  tone: "emerald" | "amber" | "blue" | "slate" | "rose" | "violet";
};

const TONE_STYLES: Record<
  Slide["tone"],
  { ring: string; verbBg: string; verbFg: string }
> = {
  emerald: {
    ring: "border-emerald-200/80",
    verbBg: "bg-emerald-50",
    verbFg: "text-emerald-800",
  },
  amber: {
    ring: "border-amber-200/80",
    verbBg: "bg-amber-50",
    verbFg: "text-amber-900",
  },
  blue: {
    ring: "border-blue-200/80",
    verbBg: "bg-blue-50",
    verbFg: "text-blue-900",
  },
  slate: {
    ring: "border-slate-200/80",
    verbBg: "bg-slate-100",
    verbFg: "text-slate-800",
  },
  rose: {
    ring: "border-rose-200/80",
    verbBg: "bg-rose-50",
    verbFg: "text-rose-900",
  },
  violet: {
    ring: "border-violet-200/80",
    verbBg: "bg-violet-50",
    verbFg: "text-violet-900",
  },
};

const BASE_SLIDES: Slide[] = [
  {
    id: "watch",
    verb: "Watch",
    line: "Headlines move first - AI maps which moves actually hit fundamentals.",
    tone: "blue",
  },
  {
    id: "trim",
    verb: "Trim",
    line: "Rich multiples + softer growth? AI flags when to lighten, not panic-sell.",
    tone: "amber",
  },
  {
    id: "add",
    verb: "Add",
    line: "Numbers improving while price sleeps - AI spots dislocations worth a look.",
    tone: "emerald",
  },
  {
    id: "hold",
    verb: "Hold",
    line: "Price moved, the business case did not. Check the filings and margins.",
    tone: "slate",
  },
  {
    id: "lookout",
    verb: "Look out",
    line: "Earnings, macro, legal - AI surfaces dates and scenarios before the wire.",
    tone: "violet",
  },
  {
    id: "buy-zone",
    verb: "Buy zone",
    line: "Only when scorecard + narrative align - AI resists chasing pure momentum.",
    tone: "emerald",
  },
  {
    id: "take-profits",
    verb: "Take profits",
    line: "Stretched RSI + hot sentiment - AI tags mean-reversion risk early.",
    tone: "rose",
  },
  {
    id: "reread",
    verb: "Re-read",
    line: "New filing, same ticker - AI diffs narrative vs. what the model already knew.",
    tone: "blue",
  },
];

function verdictSlide(intel: StockIntelPro): Slide | null {
  const o = intel.overall;
  if (!o || typeof o.score !== "number") return null;
  const verdict = (o.verdict || "mixed").replace(/\b\w/g, (c) => c.toUpperCase());
  const stance = (o.stance || "").trim();
  const stanceBit = stance ? ` · ${stance}` : "";
  return {
    id: "intel-live",
    verb: `${Math.round(o.score)}/100`,
    line: `${verdict} scorecard${stanceBit} - blended with live news for today's stance.`,
    tone:
      verdict.toLowerCase() === "strong"
        ? "emerald"
        : verdict.toLowerCase() === "weak"
          ? "rose"
          : verdict.toLowerCase() === "mixed"
            ? "amber"
            : "blue",
  };
}

function SlideCard({ slide }: { slide: Slide }) {
  const t = TONE_STYLES[slide.tone];
  return (
    <article
      className={`flex w-56 shrink-0 flex-col gap-1.5 rounded-xl border bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur-sm ${t.ring}`}
    >
      <span
        className={`inline-flex w-fit rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${t.verbBg} ${t.verbFg}`}
      >
        {slide.verb}
      </span>
      <p className="text-[11px] font-medium leading-snug text-[#374151]">{slide.line}</p>
    </article>
  );
}

type Props = {
  ticker: string;
  intelPro?: StockIntelPro | null;
};

export function StockAiDecisionCarousel({ ticker, intelPro }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const slides = useMemo(() => {
    const live = intelPro ? verdictSlide(intelPro) : null;
    const core = live ? [live, ...BASE_SLIDES] : BASE_SLIDES;
    return core;
  }, [intelPro]);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#eef2ff] bg-gradient-to-br from-[#f8fafc] via-white to-[#eff6ff] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0052ff]">
          How AI helps you decide
        </p>
        <span className="text-[10px] font-medium text-[#9ca3af] tabular-nums">{ticker}</span>
      </div>
      <p className="text-[11px] leading-snug text-[#6b7280]">
        Suggestion-style cues from <span className="font-semibold text-[#374151]">news + fundamentals</span> - not
        advice; open the AI tab for the full read.
      </p>

      {reducedMotion ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {slides.map((s) => (
            <SlideCard key={s.id} slide={s} />
          ))}
        </div>
      ) : (
        <div
          className="relative overflow-hidden rounded-lg py-0.5"
          style={{
            maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
          }}
        >
          <div className="flex w-max animate-stock-ai-marquee">
            {[0, 1].map((loop) => (
              <div key={loop} className="flex shrink-0 items-stretch gap-2 pr-2">
                {slides.map((s) => (
                  <SlideCard key={`${loop}-${s.id}`} slide={s} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
