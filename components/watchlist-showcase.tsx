"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { StockLogo } from "@/components/stock-logo";

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  visual: () => React.ReactNode;
};

function PulseDot({ color = "#10b981" }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
        style={{ background: color }}
      />
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ background: color }}
      />
    </span>
  );
}

const SAMPLE_TICKERS: { ticker: string; name: string; pct: number }[] = [
  { ticker: "NVDA",  name: "NVIDIA",     pct: 2.4 },
  { ticker: "MSFT",  name: "Microsoft",  pct: -0.6 },
  { ticker: "AAPL",  name: "Apple",      pct: 0.3 },
  { ticker: "GOOGL", name: "Alphabet",   pct: 1.7 },
  { ticker: "AMZN",  name: "Amazon",     pct: 0.9 },
  { ticker: "TSLA",  name: "Tesla",      pct: -2.8 },
  { ticker: "AVGO",  name: "Broadcom",   pct: 1.1 },
  { ticker: "META",  name: "Meta",       pct: 0.5 },
];

function StocksGridVisual() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#6b7280] tracking-[0.08em] uppercase">
          Radar tracking 28 stocks
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#6b7280]">
          <PulseDot />
          Live
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SAMPLE_TICKERS.map((s, i) => {
          const up = s.pct >= 0;
          return (
            <div
              key={s.ticker}
              className="flex items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-white px-2.5 py-2 animate-[fade-up_0.6s_ease-out_both]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <StockLogo ticker={s.ticker} size={28} />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[12px] font-semibold text-[#111111] truncate">
                  {s.ticker}
                </span>
                <span className="text-[10px] text-[#6b7280] truncate">
                  {s.name}
                </span>
              </div>
              <span
                className={`text-[11px] font-semibold tabular-nums ${
                  up ? "text-[#10b981]" : "text-[#ef4444]"
                }`}
              >
                {up ? "▲" : "▼"} {Math.abs(s.pct).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center rounded-xl border border-dashed border-[#e5e7eb] bg-[#f8f9fa] py-2 text-[11px] font-medium text-[#6b7280]">
        + 20 more · scroll your full list
      </div>
    </div>
  );
}

function BriefVisual() {
  const lines = [
    "S&P opened flat after CPI; semis leading.",
    "NVDA testing prior breakout — watch $138 close.",
    "MSFT muted ahead of Copilot guidance Thursday.",
    "Healthcare lagging; AI Drug names hit by FDA delay.",
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0052ff] text-white text-[12px] font-semibold">
            T
          </div>
          <span className="text-[13px] font-semibold text-[#111111]">
            Morning brief
          </span>
        </div>
        <span className="text-[11px] text-[#6b7280] tabular-nums">7:30 AM</span>
      </div>
      <div className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <div
            key={i}
            className="flex items-start gap-2 animate-[fade-up_0.5s_ease-out_both]"
            style={{ animationDelay: `${i * 220}ms` }}
          >
            <span className="mt-1.5 h-1 w-1 rounded-full bg-[#0052ff] shrink-0" />
            <p className="text-[13px] text-[#111111] leading-snug">{line}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 pt-1 text-[11px] text-[#4a4d55]">
        <PulseDot color="#0052ff" />
        Refreshes again at 4:30 PM ET
      </div>
    </div>
  );
}

function AlertsVisual() {
  const alerts = [
    { ticker: "TSLA", name: "Tesla",    kind: "Overbought", detail: "RSI 78 · 3rd day above",  color: "#ef4444" },
    { ticker: "AVGO", name: "Broadcom", kind: "Earnings",   detail: "Reports Thursday after close", color: "#f59e0b" },
    { ticker: "MU",   name: "Micron",   kind: "52w low",    detail: "Broke below 84.30 support", color: "#ef4444" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {alerts.map((a, i) => (
        <div
          key={a.ticker}
          className="flex items-start gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 animate-[fade-up_0.55s_ease-out_both]"
          style={{ animationDelay: `${i * 200}ms` }}
        >
          <StockLogo ticker={a.ticker} size={36} />
          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#111111]">
                {a.ticker}
              </span>
              <span className="text-[11px] text-[#6b7280] truncate">
                {a.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
                style={{ background: a.color }}
              >
                {a.kind}
              </span>
              <span className="text-[12px] text-[#4a4d55]">{a.detail}</span>
            </div>
          </div>
          <PulseDot color={a.color} />
        </div>
      ))}
    </div>
  );
}

function BlindspotsVisual() {
  const items = [
    {
      ticker: "INTC",
      name: "Intel",
      label: "Buried downgrade",
      detail: "Mizuho cut PT $32 → $24 · not picked up by majors",
      color: "#7c3aed",
    },
    {
      ticker: "AAPL",
      name: "Apple",
      label: "Options flow flip",
      detail: "Put/call jumped 1.8× at noon · institutional hedging",
      color: "#0052ff",
    },
    {
      ticker: "BBY",
      name: "Best Buy",
      label: "Insider sell",
      detail: "Director sold 12k shares Friday · Form 4 just filed",
      color: "#ef4444",
    },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div
          key={it.ticker}
          className="flex items-start gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4 animate-[fade-up_0.55s_ease-out_both]"
          style={{ animationDelay: `${i * 200}ms` }}
        >
          <StockLogo ticker={it.ticker} size={36} />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#111111]">
                {it.ticker}
              </span>
              <span className="text-[11px] text-[#6b7280] truncate">
                {it.name}
              </span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: it.color }}
              >
                {it.label}
              </span>
              <span className="text-[12px] text-[#4a4d55]">{it.detail}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PulseVisual() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#e5e7eb] bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#6b7280] tracking-[0.08em] uppercase">
          Today's pulse
        </span>
        <span className="text-[11px] text-[#6b7280] tabular-nums">28 stocks</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Up", value: 18, color: "#10b981" },
          { label: "Down", value: 8, color: "#ef4444" },
          { label: "Flat", value: 2, color: "#6b7280" },
        ].map((s, i) => (
          <div
            key={s.label}
            className="flex flex-col gap-1 rounded-xl border border-[#e5e7eb] bg-[#f8f9fa] px-3 py-2.5 animate-[fade-up_0.5s_ease-out_both]"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-[0.1em]">
              {s.label}
            </span>
            <span
              className="text-[24px] font-semibold tabular-nums leading-none"
              style={{ color: s.color }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2.5 rounded-xl bg-[#f8f9fa] p-3">
        <StockLogo ticker="NVDA" size={28} />
        <p className="text-[13px] text-[#111111] leading-snug">
          <span className="font-semibold">NVDA</span> is the standout — up{" "}
          <span className="font-semibold text-[#10b981]">4.2%</span> on AI conference
          buzz. Tech leads, Healthcare drags.
        </p>
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    id: "track",
    eyebrow: "Track",
    title: "Your list, one place.",
    body: "Stocks you care about — earnings, price, news — without juggling tabs.",
    visual: StocksGridVisual,
  },
  {
    id: "blindspots",
    eyebrow: "Blindspots",
    title: "Stuff that moves before the headline.",
    body: "Insiders, downgrades, flow, quiet technical setups.",
    visual: BlindspotsVisual,
  },
  {
    id: "alerts",
    eyebrow: "Alerts",
    title: "Pinged when it matters.",
    body: "Overbought, 52-week breaks, earnings tomorrow — ranked by urgency.",
    visual: AlertsVisual,
  },
  {
    id: "brief",
    eyebrow: "Brief",
    title: "Twice a day, every name.",
    body: "AM + close: short AI read across your Radar from that day’s news.",
    visual: BriefVisual,
  },
  {
    id: "pulse",
    eyebrow: "Pulse",
    title: "How your Radar moved today.",
    body: "One AI paragraph: drivers, laggards, what to watch next.",
    visual: PulseVisual,
  },
];

export function WatchlistShowcase() {
  const { user } = useUser();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, 3500);
    return () => clearInterval(t);
  }, [paused]);

  async function handleCta() {
    if (user) {
      router.push("/subscribe");
      return;
    }
    if (signingIn) return;
    setSigningIn(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      router.refresh();
    } catch {
      /* user cancelled */
    } finally {
      setSigningIn(false);
    }
  }

  const slide = SLIDES[active];

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-[24px] bg-[#0b1228] text-white p-7 md:p-10"
    >
      {/* Decorative glow */}
      <div
        className="pointer-events-none absolute -top-40 -right-32 h-[360px] w-[360px] rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(59,130,246,0.45) 0%, rgba(59,130,246,0) 70%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-32 h-[320px] w-[320px] rounded-full opacity-40"
        style={{
          background:
            "radial-gradient(circle, rgba(124,58,237,0.5) 0%, rgba(124,58,237,0) 70%)",
        }}
        aria-hidden
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-10 items-center">
        {/* Copy column */}
        <div className="flex flex-col gap-6 max-w-[480px]">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
              <PulseDot color="#a5b4fc" />
              Radar · Pro
            </span>
          </div>

          <div className="min-h-[200px]" key={slide.id}>
            <span className="block text-[12px] font-semibold tracking-[0.14em] uppercase text-[#c7d2fe] animate-[fade-up_0.45s_ease-out_both]">
              {slide.eyebrow}
            </span>
            <h2
              className="mt-3 text-[28px] md:text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-white animate-[fade-up_0.5s_ease-out_both]"
              style={{ animationDelay: "60ms" }}
            >
              {slide.title}
            </h2>
            <p
              className="mt-3 text-[15px] text-white/85 leading-[1.55] animate-[fade-up_0.55s_ease-out_both]"
              style={{ animationDelay: "120ms" }}
            >
              {slide.body}
            </p>
          </div>

          {/* Indicators */}
          <div className="flex items-center gap-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show ${s.eyebrow}`}
                className="group relative h-1.5 w-10 rounded-full bg-white/20 overflow-hidden"
              >
                <span
                  className={`absolute inset-y-0 left-0 bg-white transition-all duration-300 ${
                    i === active ? "w-full" : i < active ? "w-full opacity-30" : "w-0"
                  }`}
                  style={{
                    transitionDuration: i === active && !paused ? "3500ms" : "300ms",
                  }}
                />
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              type="button"
              onClick={handleCta}
              disabled={signingIn}
              className="inline-flex items-center justify-center h-[44px] px-6 rounded-full bg-white text-[#111111] text-[14px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform disabled:opacity-60"
            >
              {user ? "Get Pro" : signingIn ? "Signing in…" : "Sign in"}
            </button>
            <span className="text-[12px] text-white/65">
              Pro $9/mo · cancel anytime
            </span>
          </div>
        </div>

        {/* Visual column */}
        <div
          key={slide.id + "-v"}
          className="relative animate-[fade-up_0.6s_ease-out_both]"
        >
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-md p-5 md:p-6">
            <slide.visual />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-up {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}
