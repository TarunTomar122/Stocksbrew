"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Slide 1: AI Directive demo ───────────────────────────────────────────────

function DirectiveSlide() {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="relative overflow-hidden rounded-2xl border border-[#e5e7eb] px-6 py-6"
        style={{ background: "#ecfdf5", color: "#065f46" }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 select-none font-semibold tracking-[-0.04em] text-[96px] leading-none opacity-[0.06]"
        >
          NVDA
        </span>
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase bg-[#10b981] text-white">
              Accumulate
            </span>
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase opacity-75">
              Strategic directive
            </span>
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase opacity-60">
              · Med confidence
            </span>
          </div>
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] leading-[1.2]">
            Lean into NVDA into the next data-center print - supply commentary still leaves room vs. margin expectations.
          </h3>
          <p className="text-[13px] leading-[1.55] opacity-85">
            Growth and momentum pillars lead the scorecard; valuation is the friction the model weighs into the catalyst window.
          </p>
        </div>
      </div>
      <p className="text-[13px] text-[#6b7280] leading-relaxed text-center">
        stocksbrew reads fundamentals, news, Reddit, and earnings, then gives you a clear call on what to do so you do not have to piece it together yourself.
      </p>
    </div>
  );
}

// ─── Slide 2: Signal tiles demo ───────────────────────────────────────────────

const DEMO_TILES = [
  { emoji: "🎯", bg: "#eff6ff", label: "Analyst target", headline: "+14.2%", sub: "Target $195 · 42 analysts", color: "#10b981" },
  { emoji: "🔥", bg: "#fef3c7", label: "RSI stretched", headline: "73", sub: "Pullback risk", color: "#b45309" },
  { emoji: "🚀", bg: "#eff6ff", label: "Strong momentum", headline: "82", sub: "Top pillar", color: "#10b981" },
  { emoji: "📅", bg: "#fef3c7", label: "Next earnings", headline: "May 20", sub: "Watch for guide", color: "#b45309" },
  { emoji: "💰", bg: "#ecfdf5", label: "Revenue YoY", headline: "+18.4%", sub: "Solid growth tape", color: "#10b981" },
  { emoji: "🏛️", bg: "#f3f4f6", label: "Institutional", headline: "74.2%", sub: "Footprint of total float", color: "#111111" },
];

function SignalsSlide() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        {DEMO_TILES.map((t) => (
          <div
            key={t.label}
            className="flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-3"
          >
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[16px]"
              style={{ background: t.bg }}
            >
              {t.emoji}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af]">
                {t.label}
              </span>
              <span className="text-[15px] font-semibold tabular-nums leading-tight" style={{ color: t.color }}>
                {t.headline}
              </span>
              <span className="text-[10px] text-[#6b7280] leading-snug">{t.sub}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[13px] text-[#6b7280] leading-relaxed text-center">
        Instead of digging through earnings reports and analyst PDFs, you get the number that actually matters - right on the stock page.
      </p>
    </div>
  );
}

// ─── Slide 3: Radar demo ──────────────────────────────────────────────────────

const DEMO_STOCKS = [
  { ticker: "NVDA", change: "+4.12%", price: "$196.69", abs: "+$7.72", catalyst: "EARNINGS MAY 20 AMC", catalystColor: "#b45309" },
  { ticker: "GOOGL", change: "+0.79%", price: "$386.30", abs: "+$3.05", catalyst: "OVERBOUGHT · RSI 81", catalystColor: "#b91c1c" },
  { ticker: "AAPL", change: "+2.51%", price: "$283.77", abs: "+$6.94", catalyst: null, catalystColor: "" },
  { ticker: "TSLA", change: "-0.30%", price: "$391.33", abs: "-$1.18", catalyst: null, catalystColor: "" },
];

function RadarSlide() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[#e5e7eb] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] bg-[#fafafa]">
          <span className="text-[13px] font-semibold text-[#111111]">Watching</span>
          <span className="text-[11px] font-semibold text-[#10b981]">+$15.73 · +1.48% avg</span>
        </div>
        <ul className="divide-y divide-[#f3f4f6]">
          {DEMO_STOCKS.map((s) => {
            const positive = s.change.startsWith("+");
            return (
              <li key={s.ticker} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                  style={{ background: "#111111" }}
                >
                  {s.ticker.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[14px] font-semibold text-[#111111]">{s.ticker}</span>
                  {s.catalyst && (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mt-0.5" style={{ color: s.catalystColor }}>
                      {s.catalyst}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[13px] font-semibold tabular-nums text-[#111111]">{s.price}</span>
                  <span className={`text-[11px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>{s.change}</span>
                  <span className={`text-[10px] tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>{s.abs}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-[13px] text-[#6b7280] leading-relaxed text-center">
        Add the stocks you follow and stocksbrew shows you what moved, what's loud in the news, and what needs your attention - without you having to check 10 tabs.
      </p>
    </div>
  );
}

// ─── Slides config ────────────────────────────────────────────────────────────

const SLIDES = [
  {
    step: "01",
    title: "An AI take on every stock you follow",
    subtitle: "Not a summary. An actual opinion on what's going on and what to watch.",
    content: <DirectiveSlide />,
  },
  {
    step: "02",
    title: "The stuff that actually moves a stock",
    subtitle: "RSI, analyst targets, earnings windows, revenue growth - in one place, no digging.",
    content: <SignalsSlide />,
  },
  {
    step: "03",
    title: "Your personal watchlist that keeps up",
    subtitle: "See everything across your stocks at a glance - what moved, what's loud, what's next.",
    content: <RadarSlide />,
  },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

type Props = {
  onClose: () => void;
};

export function OnboardingModal({ onClose }: Props) {
  const [slide, setSlide] = useState(0);
  const total = SLIDES.length;
  const current = SLIDES[slide];
  const isLast = slide === total - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && slide < total - 1) setSlide((s) => s + 1);
      if (e.key === "ArrowLeft" && slide > 0) setSlide((s) => s - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, slide, total]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#111111]/60 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="relative w-full max-w-[580px] h-[600px] rounded-3xl bg-white shadow-[0_32px_80px_rgba(17,24,39,0.22)] flex flex-col overflow-hidden">
        {/* Welcome banner - only on slide 0 */}
        {slide === 0 && (
          <div className="flex items-center gap-3 bg-[#f3f4f6] border-b border-[#e5e7eb] px-6 py-3">
            <span className="text-[20px]">👋</span>
            <div>
              <p className="text-[14px] font-semibold text-[#111111]">Welcome to stocksbrew!</p>
              <p className="text-[12px] text-[#6b7280]">Here's what you can do - quick 30-second tour.</p>
            </div>
          </div>
        )}

        {/* Slide header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div className="flex flex-col gap-1 flex-1 min-w-0 pr-4">
            <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9ca3af]">
              {current.step} of 0{total}
            </span>
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight">
              {current.title}
            </h2>
            <p className="text-[13px] text-[#6b7280]">{current.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Slide content */}
        <div className="flex-1 px-6 pb-2 overflow-y-auto">
          {current.content}
        </div>

        {/* Last slide: subscribe CTA */}
        {isLast && (
          <div className="flex flex-col gap-3 px-6 py-5 border-t border-[#f3f4f6]">
            <Link
              href="/subscribe"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center gap-2 h-11 rounded-full bg-[#111111] text-[14px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
            >
              Unlock everything - $9/mo
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] text-[#9ca3af] hover:text-[#6b7280] transition-colors text-center"
            >
              No thanks, I don't want my stocks to make money 😢
            </button>
          </div>
        )}

        {/* Footer: dots + nav */}
        <div className={`flex items-center justify-between gap-4 px-6 py-5 ${isLast ? "" : "border-t border-[#f3f4f6]"}`}>
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSlide(i)}
                className={`rounded-full transition-all ${
                  i === slide ? "w-5 h-2 bg-[#111111]" : "w-2 h-2 bg-[#e5e7eb]"
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {slide > 0 && !isLast && (
              <button
                type="button"
                onClick={() => setSlide((s) => s - 1)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[#e5e7eb] px-4 text-[13px] font-semibold text-[#6b7280] hover:border-[#d1d5db] transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Back
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={() => setSlide((s) => s + 1)}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
              >
                Next
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
