"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";

async function startCheckout(): Promise<string> {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Not signed in");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/subscription/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ period: "monthly" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Checkout failed");
  if (!json.checkoutUrl) throw new Error("No checkout URL");
  return json.checkoutUrl;
}

// ─── Slide demos ──────────────────────────────────────────────────────────────

function DirectiveSlide() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#d1fae5] px-7 py-7"
      style={{ background: "#ecfdf5", color: "#065f46" }}
    >
      <span aria-hidden className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 select-none font-semibold tracking-[-0.04em] text-[120px] leading-none opacity-[0.06]">
        NVDA
      </span>
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-[0.1em] uppercase bg-[#10b981] text-white">Accumulate</span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase opacity-60">Strategic directive · Med confidence</span>
        </div>
        <p className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] leading-[1.2]">
          Lean into NVDA into the next data-center print - supply commentary still leaves room vs. margin expectations.
        </p>
        <p className="text-[14px] leading-relaxed opacity-80">
          Growth and momentum pillars lead the scorecard; valuation is the friction the model weighs into the catalyst window.
        </p>
      </div>
    </div>
  );
}

const DEMO_TILES = [
  { emoji: "🎯", bg: "#eff6ff", label: "Analyst target",  headline: "+14.2%", sub: "Target $195 · 42 analysts", color: "#10b981" },
  { emoji: "🔥", bg: "#fef3c7", label: "RSI stretched",   headline: "73",     sub: "Pullback risk",             color: "#b45309" },
  { emoji: "🚀", bg: "#eff6ff", label: "Strong momentum", headline: "82",     sub: "Top pillar",                color: "#10b981" },
  { emoji: "📅", bg: "#fef3c7", label: "Next earnings",   headline: "May 20", sub: "Watch for guide",           color: "#b45309" },
  { emoji: "💰", bg: "#ecfdf5", label: "Revenue YoY",     headline: "+18.4%", sub: "Solid growth tape",         color: "#10b981" },
  { emoji: "🏛️", bg: "#f3f4f6", label: "Institutional",   headline: "74.2%",  sub: "Footprint of total float",  color: "#111111" },
];

function SignalsSlide() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {DEMO_TILES.map((t) => (
        <div key={t.label} className="flex flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]" style={{ background: t.bg }}>
            {t.emoji}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af]">{t.label}</span>
            <span className="text-[18px] font-semibold tabular-nums leading-tight" style={{ color: t.color }}>{t.headline}</span>
            <span className="text-[11px] text-[#6b7280] leading-snug">{t.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const DEMO_STOCKS = [
  { ticker: "NVDA",  change: "+4.12%", price: "$196.69", abs: "+$7.72", catalyst: "EARNINGS MAY 20 AMC",  catalystColor: "#b45309" },
  { ticker: "GOOGL", change: "+0.79%", price: "$386.30", abs: "+$3.05", catalyst: "OVERBOUGHT · RSI 81",  catalystColor: "#b91c1c" },
  { ticker: "AAPL",  change: "+2.51%", price: "$283.77", abs: "+$6.94", catalyst: null,                   catalystColor: "" },
  { ticker: "TSLA",  change: "-0.30%", price: "$391.33", abs: "-$1.18", catalyst: null,                   catalystColor: "" },
];

function RadarSlide() {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e5e7eb] bg-[#fafafa]">
        <span className="text-[14px] font-semibold text-[#111111]">Watching</span>
        <span className="text-[13px] font-semibold text-[#10b981]">+$15.73 · +1.48% avg today</span>
      </div>
      <ul className="divide-y divide-[#f3f4f6]">
        {DEMO_STOCKS.map((s) => {
          const positive = s.change.startsWith("+");
          return (
            <li key={s.ticker} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#111111] text-[12px] font-bold text-white">
                {s.ticker.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] font-semibold text-[#111111]">{s.ticker}</span>
                {s.catalyst && (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: s.catalystColor }}>
                    {s.catalyst}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[14px] font-semibold tabular-nums text-[#111111]">{s.price}</span>
                <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>{s.change}</span>
                <span className={`text-[11px] tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>{s.abs}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Slides ───────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    label: "AI directives",
    title: "An AI take on every stock you follow",
    subtitle: "stocksbrew reads fundamentals, news, Reddit, and earnings and gives you a plain buy, hold, or sell read on what's going on - so you don't have to piece it together yourself.",
    demo: <DirectiveSlide />,
  },
  {
    label: "Signal overview",
    title: "The numbers that actually matter",
    subtitle: "Instead of digging through reports and PDFs, you get the metrics that move a stock - right on the page, no hunting around.",
    demo: <SignalsSlide />,
  },
  {
    label: "Radar",
    title: "Your watchlist that keeps up",
    subtitle: "Add the stocks you follow and stocksbrew shows you what moved, what's loud in the news, and what needs your attention today.",
    demo: <RadarSlide />,
  },
];

const STORAGE_KEY = "tikrr_onboarded";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const total = SLIDES.length;
  const current = SLIDES[slide];
  const isLast = slide === total - 1;

  async function handleSubscribe() {
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const url = await startCheckout();
      await finish();
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Something went wrong");
      setCheckoutLoading(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" && slide < total - 1) setSlide((s) => s + 1);
      if (e.key === "ArrowLeft" && slide > 0) setSlide((s) => s - 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [slide, total]);

  async function finish() {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    // Persist completion server-side so onboarding does not reappear on
    // storage-isolated browsers/devices.
    try {
      await fetch("/api/user/onboarding", { method: "POST" });
    } catch {
      // best effort
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-6 md:px-10 h-14 border-b border-[#f3f4f6]">
        <span className="text-[20px] font-semibold text-[#111111] tracking-[-0.04em]">stocksbrew</span>
        {/* Dot progress */}
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlide(i)}
              className={`rounded-full transition-all duration-200 ${i === slide ? "w-6 h-2 bg-[#111111]" : "w-2 h-2 bg-[#e5e7eb] hover:bg-[#d1d5db]"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={async () => { await finish(); router.push("/"); }}
          className="text-[13px] font-medium text-[#9ca3af] hover:text-[#6b7280] transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Main content - scrollable on small screens */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 md:px-10 py-8 md:py-10">
        <div className="w-full max-w-[680px] flex flex-col gap-8">
          {/* Text block */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9ca3af]">
              {String(slide + 1).padStart(2, "0")} of {String(total).padStart(2, "0")} · {current.label}
            </span>
            <h1 className="text-[28px] md:text-[36px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
              {current.title}
            </h1>
            <p className="text-[15px] text-[#6b7280] leading-relaxed max-w-[520px]">
              {current.subtitle}
            </p>
          </div>

          {/* Demo */}
          <div>{current.demo}</div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex shrink-0 items-center justify-between px-6 md:px-10 py-4 min-h-16 border-t border-[#f3f4f6]">
        <div className="w-20">
          {slide > 0 && !isLast && (
            <button
              type="button"
              onClick={() => setSlide((s) => s - 1)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6b7280] hover:text-[#111111] transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              Back
            </button>
          )}
        </div>

        {isLast ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={checkoutLoading}
              className="inline-flex items-center gap-2 h-11 rounded-full bg-[#111111] px-7 text-[14px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform disabled:opacity-60 disabled:cursor-wait"
            >
              {checkoutLoading ? "Opening checkout…" : "Unlock everything - $9/mo"}
              {!checkoutLoading && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>}
            </button>
            {checkoutError && <p className="text-[12px] text-[#ef4444]">{checkoutError}</p>}
            <button
              type="button"
              onClick={async () => { await finish(); router.push("/"); }}
              className="text-[12px] text-[#9ca3af] hover:text-[#6b7280] transition-colors"
            >
              No thanks, I don't want my stocks to make money 😢
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSlide((s) => s + 1)}
            className="inline-flex items-center gap-2 h-11 rounded-full bg-[#111111] px-6 text-[14px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            Next
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
          </button>
        )}

        <div className="w-20" />
      </div>
    </div>
  );
}
