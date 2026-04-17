"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const WAITLIST = process.env.NEXT_PUBLIC_WAITLIST_MODE === "true";

/* ── Scroll reveal ── */

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.7s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}ms, transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── Ticker tape ── */

const tickerData = [
  { t: "NVDA", p: 924.79, c: +3.42 }, { t: "AAPL", p: 189.84, c: -0.67 },
  { t: "MSFT", p: 420.55, c: +1.18 }, { t: "TSLA", p: 248.42, c: +5.21 },
  { t: "GOOGL", p: 175.98, c: +0.94 }, { t: "AMZN", p: 185.07, c: +2.14 },
  { t: "META", p: 505.36, c: -1.23 }, { t: "AMD", p: 162.48, c: +4.07 },
  { t: "NFLX", p: 628.12, c: +1.56 }, { t: "JPM", p: 198.34, c: +0.38 },
];

function TickerTape() {
  const items = [...tickerData, ...tickerData];
  return (
    <div className="overflow-hidden border-b border-[#1A1A1A] bg-[#1A1A1A]">
      <div className="flex animate-[scroll_30s_linear_infinite] whitespace-nowrap py-2.5">
        {items.map((s, i) => (
          <span key={`${s.t}-${i}`} className="mx-6 inline-flex items-center gap-2 text-xs text-white/40">
            <span className="font-bold tracking-wider text-white/70">{s.t}</span>
            <span className="font-mono tabular-nums">${s.p.toFixed(2)}</span>
            <span className={`font-bold font-mono tabular-nums ${s.c >= 0 ? "text-[#D4AF37]" : "text-red-400"}`}>
              {s.c >= 0 ? "+" : ""}{s.c.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Simulated AI "thinking" stream ── */

const aiStreamLines = [
  { delay: 0, text: "Scanning 47 sources for NVDA..." },
  { delay: 600, text: "Reuters: Blackwell Ultra chip announcement detected" },
  { delay: 1100, text: "r/wallstreetbets sentiment: 84% bullish (↑12% vs yesterday)" },
  { delay: 1700, text: "SEC filing: Insider sale by CFO — $2.1M, routine 10b5-1 plan" },
  { delay: 2300, text: "Cross-referencing with 3 analyst upgrades this week..." },
  { delay: 2800, text: "Generating intelligence summary..." },
  { delay: 3500, text: "✓ Bullish — strong catalyst pipeline, manageable risk profile" },
];

function AIStream() {
  const [visibleCount, setVisibleCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !hasStarted.current) {
        hasStarted.current = true;
        aiStreamLines.forEach((line, i) => {
          setTimeout(() => setVisibleCount(i + 1), line.delay);
        });
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="font-mono text-xs space-y-2 border border-[#1A1A1A] bg-[#1A1A1A] p-6 text-white/60 min-h-[220px]">
      <div className="text-[10px] uppercase tracking-[0.4em] text-[#D4AF37]/60 mb-4">tikrr ai engine</div>
      {aiStreamLines.slice(0, visibleCount).map((line, i) => (
        <div
          key={i}
          className="flex items-start gap-2"
          style={{
            opacity: 1,
            animation: "fadeSlideIn 0.3s ease-out",
          }}
        >
          <span className="text-[#D4AF37] shrink-0 mt-px">
            {i === aiStreamLines.length - 1 && visibleCount === aiStreamLines.length ? "●" : "›"}
          </span>
          <span className={i === aiStreamLines.length - 1 && visibleCount === aiStreamLines.length ? "text-[#D4AF37] font-bold" : ""}>
            {line.text}
          </span>
        </div>
      ))}
      {visibleCount < aiStreamLines.length && visibleCount > 0 && (
        <div className="flex items-center gap-1 text-white/40">
          <span className="animate-pulse">▊</span>
        </div>
      )}
    </div>
  );
}

/* ── Confetti burst ── */

function Confetti() {
  const palette = ["#D4AF37", "#E8D48B", "#B8972E", "#D4C076", "#9A7E20", "#D4AF37"];
  const pieces = useRef(
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: 40 + Math.random() * 20,
      color: palette[i % palette.length],
      w: Math.random() * 5 + 3,
      h: Math.random() * 8 + 4,
      delay: Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 120,
      duration: Math.random() * 1.2 + 1.4,
      rotation: Math.random() * 360,
    })),
  ).current;

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: "30%",
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "1px",
            transform: `rotate(${p.rotation}deg)`,
            animation: `confettiBurst ${p.duration}s cubic-bezier(.15,.8,.3,1) ${p.delay}s forwards`,
            "--drift": `${p.drift}px`,
            "--lift": `${-(Math.random() * 300 + 200)}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ── Success overlay ── */

function WaitlistSuccess({ email, onClose }: { email: string; onClose: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true));
  }, []);

  async function sendFeedback() {
    if (!feedback.trim()) return;
    setSending(true);
    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, feedback }),
      });
    } catch { /* best effort */ }
    setSent(true);
    setSending(false);
  }

  return createPortal(
    <>
      <Confetti />
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${entered ? "bg-black/80 backdrop-blur-xl" : "bg-black/0 backdrop-blur-0"}`}
        onClick={onClose}
      >
        <div
          className={`bg-[#1A1A1A] max-w-sm w-full overflow-hidden relative transition-all duration-500 ease-out ${entered ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-1 bg-[#D4AF37]" />

          <div className="p-8 sm:p-10">
            <div className="w-12 h-12 border border-[#D4AF37] flex items-center justify-center mb-6 mx-auto">
              <span className="material-symbols-outlined text-[#D4AF37] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
            </div>

            <h3 className="text-center text-xl font-headline italic text-white mb-2">
              You&apos;re on the list
            </h3>
            <p className="text-center text-sm text-white/70 leading-relaxed mb-1">
              We&apos;re close to launch — glad to have you here.
            </p>
            <p className="text-center text-xs text-white/40 mb-8">
              No spam. Just one email when we go live.
            </p>

            <div className="h-px bg-white/10 mb-6" />

            {sent ? (
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#D4AF37] py-2">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                Appreciate it — noted!
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.3em] text-white/60 mb-2">
                  What would you love to see? <span className="text-white/30 font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="I'd love if tikrr could…"
                  rows={3}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/40 resize-none transition-all"
                />
                <div className={`overflow-hidden transition-all duration-200 ${feedback.trim() ? "max-h-14 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"}`}>
                  <button
                    type="button"
                    onClick={sendFeedback}
                    disabled={sending}
                    className="btn-gold-slide w-full py-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white disabled:opacity-60"
                  >
                    {sending ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full text-center text-xs text-white/40 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ── Waitlist form ── */

function WaitlistForm({ dark = false }: { dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMsg(data.error || "Something went wrong");
      } else {
        setState("done");
        setSavedEmail(email);
        setEmail("");
        setShowOverlay(true);
      }
    } catch {
      setState("error");
      setMsg("Network error — please try again");
    }
  }

  return (
    <>
      {showOverlay && <WaitlistSuccess email={savedEmail} onClose={() => setShowOverlay(false)} />}

      {state === "done" && !showOverlay ? (
        <div className={`flex items-center gap-2 text-sm font-semibold ${dark ? "text-[#D4AF37]" : "text-[#D4AF37]"}`}>
          <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          You&apos;re on the list!
        </div>
      ) : state !== "done" ? (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-md">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setState("idle"); }}
            placeholder="you@example.com"
            required
            className={`flex-1 px-5 py-3.5 text-sm focus:outline-none transition-all ${
              dark
                ? "bg-white/5 text-white placeholder:text-white/30 border border-white/10 focus:border-[#D4AF37]/40"
                : "bg-white border border-[#1A1A1A]/20 placeholder:text-[#1A1A1A]/30 focus:border-[#D4AF37]"
            }`}
          />
          <button
            type="submit"
            disabled={state === "loading"}
            className="btn-gold-slide px-8 py-3.5 text-[10px] font-bold uppercase tracking-[0.3em] disabled:opacity-60 shrink-0"
          >
            {state === "loading" ? "Joining…" : "Join Waitlist"}
          </button>
          {state === "error" && (
            <p className="text-xs text-[#9B2226] mt-1 sm:mt-0 sm:ml-2">{msg}</p>
          )}
        </form>
      ) : null}
    </>
  );
}

/* ── Page ── */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] font-body selection:bg-[#D4AF37] selection:text-white">
      <TickerTape />

      {/* Header */}
      <header className="sticky top-0 z-50 h-[72px] border-b border-[#1A1A1A] bg-[#F9F8F6]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="font-headline text-2xl font-black tracking-tighter">ti<span className="text-[#D4AF37]">k</span>rr</span>
          </div>
          <div className="flex items-center gap-4">
            {WAITLIST ? (
              <a
                href="#waitlist"
                className="btn-gold-slide px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.3em]"
              >
                Join Waitlist
              </a>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="hidden sm:inline-flex text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/50 transition-colors hover:text-[#D4AF37]"
                >
                  Log in
                </Link>
                <Link
                  href="/dashboard"
                  className="btn-gold-slide px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.3em]"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="px-6 pt-24 pb-20 sm:pt-36 sm:pb-28">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/30 mb-6 text-center">Market Intelligence</p>
              <h1 className="text-center font-headline text-[3rem] font-medium leading-[0.92] tracking-tight sm:text-[5.5rem]">
                Wall Street&apos;s
                <br />
                <span className="italic text-[#1A1A1A]/40">morning routine.</span>
              </h1>
            </Reveal>
            <Reveal delay={80}>
              <p className="mx-auto mt-8 max-w-lg text-center text-base leading-[1.9] text-[#1A1A1A]/60">
                Every morning, tikrr digests thousands of signals across news, social, and Wall Street and distills it into the only briefing you need before the bell.
              </p>
              <div className="mt-6 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/30">
                <span className="border border-[#1A1A1A]/10 px-3 py-1.5">
                  🇺🇸 NYSE · NASDAQ
                </span>
                <span className="border border-[#1A1A1A]/10 px-3 py-1.5">
                  🇮🇳 NSE · BSE
                </span>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div className="mt-12 flex flex-col items-center gap-4">
                {WAITLIST ? (
                  <>
                    <WaitlistForm />
                    <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#1A1A1A]/30">
                      <span className="inline-block w-1.5 h-1.5 bg-[#D4AF37] animate-pulse" />
                      Joining 2,400+ investors on the waitlist
                    </p>
                  </>
                ) : (
                  <div className="flex gap-4">
                  <Link
                    href="/dashboard"
                    className="btn-gold-slide px-10 py-4 text-[10px] font-bold uppercase tracking-[0.3em]"
                  >
                    Open Dashboard
                  </Link>
                  <Link
                    href="/dashboard"
                    className="border border-[#1A1A1A]/20 px-10 py-4 text-[10px] font-bold uppercase tracking-[0.3em] transition-all hover:border-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#F9F8F6]"
                  >
                    View demo
                  </Link>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Before / After ── */}
        <section className="px-6 pb-20 sm:pb-28">
          <div className="mx-auto max-w-4xl">
            <Reveal>
              <div className="grid md:grid-cols-2 gap-0">
                {/* Before */}
                <div className="border border-[#1A1A1A]/10 p-8">
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#9B2226] mb-6">Without tikrr</p>
                  <div className="space-y-3">
                    {[
                      { time: "6:30", task: "Open Bloomberg, scan headlines" },
                      { time: "6:42", task: "Check Reddit, Twitter for sentiment" },
                      { time: "6:55", task: "Read 3 Seeking Alpha articles" },
                      { time: "7:10", task: "Cross-check analyst ratings" },
                      { time: "7:25", task: "Google SEC filings for unusual activity" },
                      { time: "7:40", task: "Finally open broker — already stressed" },
                    ].map((step) => (
                      <div key={step.time} className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-[10px] text-[#1A1A1A]/30 tabular-nums w-10 shrink-0">{step.time}</span>
                        <span className="text-[#1A1A1A]/40 line-through decoration-[#1A1A1A]/20">{step.task}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#1A1A1A]/10 flex items-center gap-2 text-xs text-[#1A1A1A]/40">
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    70+ minutes &middot; 12 tabs &middot; still missed stuff
                  </div>
                </div>

                {/* After */}
                <div className="border border-[#D4AF37]/30 p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 blur-3xl" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#D4AF37] mb-6 relative">With tikrr</p>
                  <div className="space-y-3 relative">
                    {[
                      { time: "6:30", task: "Open tikrr. AI briefing is ready." },
                      { time: "6:32", task: "Scan watchlist — NVDA flagged as high-signal" },
                      { time: "6:34", task: "Read AI summary: 3 catalysts, 1 risk" },
                      { time: "6:35", task: "Check sentiment lanes — social is 84% bullish" },
                      { time: "6:36", task: "Open broker. You already know." },
                    ].map((step) => (
                      <div key={step.time} className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-[10px] text-[#D4AF37] tabular-nums w-10 shrink-0">{step.time}</span>
                        <span className="font-medium">{step.task}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#D4AF37]/20 flex items-center gap-2 text-xs text-[#D4AF37] font-bold relative">
                    <span className="material-symbols-outlined text-sm">bolt</span>
                    6 minutes &middot; 1 tab &middot; nothing missed
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── AI Engine Preview ── */}
        <section className="px-6 pb-20 sm:pb-28">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <div className="grid lg:grid-cols-2 gap-12 items-start">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/30 mb-4">The engine</p>
                  <h2 className="font-headline text-4xl leading-[1.05] sm:text-5xl">
                    It read 2,847 articles last night.
                    <br />
                    <span className="italic text-[#1A1A1A]/40">You&apos;ll read one summary.</span>
                  </h2>
                  <p className="mt-6 text-sm leading-[1.9] text-[#1A1A1A]/60 max-w-md">
                    Not a chatbot. Not a summary tool. tikrr&apos;s engine continuously
                    ingests financial news, social discussions, SEC filings, and analyst
                    reports — then synthesizes them into one clear signal per stock.
                  </p>
                  <div className="mt-10 flex gap-12">
                    {[
                      { n: "50+", l: "sources" },
                      { n: "200+", l: "stocks" },
                      { n: "<5m", l: "latency" },
                    ].map((s) => (
                      <div key={s.l}>
                        <p className="font-headline text-3xl italic">{s.n}</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[#1A1A1A]/40 mt-1">{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <AIStream />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── What you get ── */}
        <section className="px-6 pb-20 sm:pb-28">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/30 mb-4">What you get</p>
              <h2 className="font-headline text-3xl sm:text-4xl mb-12">
                Everything you need. <span className="italic text-[#1A1A1A]/40">Nothing you don&apos;t.</span>
              </h2>
            </Reveal>
            <div className="grid md:grid-cols-2 gap-0">
              {[
                {
                  title: "AI Intelligence Briefs",
                  body: "Catalysts, risks, key points — from dozens of sources, in one paragraph.",
                  accent: true,
                },
                {
                  icon: "psychology",
                  title: "Multi-Lane Sentiment",
                  body: "News says one thing. Reddit says another. See who\u2019s right.",
                  accent: false,
                },
                {
                  icon: "timeline",
                  title: "Intelligence Timeline",
                  body: "How the narrative shifted, hour by hour.",
                  accent: false,
                },
                {
                  icon: "speed",
                  title: "Momentum & Technicals",
                  body: "RSI, trend signals, and social-volume — the quant layer.",
                  accent: true,
                },
                {
                  icon: "public",
                  title: "US + India in One Place",
                  body: "NYSE, NASDAQ, NSE, BSE — one dashboard, two of the world\u2019s biggest markets. No switching apps.",
                  accent: false,
                },
                {
                  icon: "bookmark",
                  title: "Your Watchlist, Your Rules",
                  body: "Track the stocks you care about across both markets. Bullish or bearish — sort by sentiment, not just price.",
                  accent: true,
                },
              ].map((card, i) => (
                <Reveal key={card.title} delay={i * 80}>
                  <div className={`p-8 border border-[#1A1A1A]/10 transition-all duration-500 hover:-translate-y-0.5 ${
                    card.accent
                      ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                      : ""
                  }`}>
                    <div className="mb-5 flex h-7 items-start">
                      {"icon" in card && card.icon ? (
                        <span
                          className={`material-symbols-outlined block text-xl ${card.accent ? "text-[#D4AF37]" : "text-[#D4AF37]"}`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {card.icon}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="font-headline text-xl italic mb-3">{card.title}</h3>
                    <p className={`text-sm leading-[1.8] ${card.accent ? "text-white/60" : "text-[#1A1A1A]/60"}`}>
                      {card.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Sample Instrument Card ── */}
        <section className="px-6 pb-20 sm:pb-28">
          <Reveal>
            <div className="mx-auto max-w-4xl">
              <div className="overflow-hidden border border-[#1A1A1A] shadow-ambient-lg">
                <div className="bg-[#1A1A1A] p-6 sm:p-8 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 border border-white/20 flex items-center justify-center text-sm font-bold">NV</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-headline text-xl italic">NVIDIA Corp</h3>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-[#D4AF37] border border-[#D4AF37]/30 px-2 py-0.5">
                            <span className="w-1 h-1 bg-[#D4AF37] animate-pulse" />
                            Updated 3m ago
                          </span>
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">NVDA &middot; Technology &middot; NASDAQ</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-2xl tabular-nums">$924.79</p>
                      <p className="text-sm font-bold text-[#D4AF37]">▲ +3.42%</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 sm:p-8">
                  <div className="grid sm:grid-cols-2 gap-8">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/40 mb-3">AI Intelligence</p>
                      <p className="text-sm text-[#1A1A1A]/60 leading-relaxed">
                        NVIDIA&apos;s Blackwell Ultra announcement positions it as the sole provider of next-gen
                        AI training infrastructure through 2026. Revenue guidance implies 40%+ growth.
                        Key risk: export restrictions to China remain fluid.
                      </p>
                      <div className="flex gap-2 mt-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-[#2D6A4F]/30 text-[#2D6A4F]">Catalyst: Blackwell Ultra</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 border border-[#9B2226]/30 text-[#9B2226]">Risk: Export controls</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1A1A1A]/40 mb-3">Sentiment Breakdown</p>
                      <div className="space-y-3">
                        {[
                          { label: "News", pct: 88 },
                          { label: "Social", pct: 84 },
                          { label: "Analyst", pct: 92 },
                        ].map((lane) => (
                          <div key={lane.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-[#1A1A1A]/50">{lane.label}</span>
                              <span className="font-bold font-mono tabular-nums">{lane.pct}%</span>
                            </div>
                            <div className="h-1 bg-[#1A1A1A]/10 overflow-hidden">
                              <div className="h-full bg-[#D4AF37]" style={{ width: `${lane.pct}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between p-3 bg-[#D4AF37]">
                        <span className="text-xs font-bold text-[#1A1A1A]">Momentum RSI</span>
                        <span className="font-mono text-lg text-[#1A1A1A] tabular-nums">71.4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-[#1A1A1A]/40 mt-4">
                This is what a tikrr instrument page looks like — for every stock in your watchlist.
              </p>
            </div>
          </Reveal>
        </section>

        {/* ── Sources ── */}
        <section className="px-6 pb-20 sm:pb-28">
          <Reveal>
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#1A1A1A]/30 mb-2">Signal sources</p>
              <h2 className="font-headline text-3xl mb-10">
                These all go into <span className="italic">one briefing.</span>
              </h2>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "Reuters", "Bloomberg", "WSJ", "Financial Times", "CNBC", "Seeking Alpha",
                  "SEC Filings", "r/wallstreetbets", "r/stocks", "StockTwits", "X / Twitter",
                  "Hacker News", "Barron's", "MarketWatch", "Analyst Reports", "Federal Reserve",
                  "Yahoo Finance", "Morningstar", "S&P Global",
                ].map((s) => (
                  <span
                    key={s}
                    className="border border-[#1A1A1A]/10 px-4 py-2 text-xs font-medium text-[#1A1A1A]/50 transition-colors hover:text-[#1A1A1A] hover:border-[#1A1A1A]/30"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Pricing / Waitlist CTA ── */}
        <section className="px-6 pb-20 sm:pb-28" id="waitlist">
          <Reveal>
            <div className="mx-auto max-w-md border border-[#1A1A1A] bg-[#1A1A1A] p-8 text-white sm:p-10">
              {WAITLIST ? (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/30 mb-6">Early Access</p>
                  <h3 className="font-headline text-2xl italic leading-tight mb-3">
                    Get early access before everyone else.
                  </h3>
                  <p className="text-sm text-white/50 mb-8 leading-relaxed">
                    We&apos;re launching soon. Join the waitlist and get early access to tikrr&apos;s
                    AI-powered intelligence briefs, sentiment analysis, and momentum signals.
                  </p>
                  <WaitlistForm dark />
                </>
              ) : (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#D4AF37] mb-6">Premium</p>
                  <h3 className="font-headline text-2xl italic leading-tight mb-3">
                    Less than your morning coffee.
                    <br />
                    <span className="text-white/40">More than your Bloomberg terminal.</span>
                  </h3>
                  <p className="text-sm text-white/50 mb-8 leading-relaxed">
                    One subscription. Every signal. Intelligence briefs, sentiment,
                    momentum, alerts — unlimited.
                  </p>
                  <div className="flex items-baseline gap-1 mb-8">
                    <span className="font-headline text-4xl italic">$12</span>
                    <span className="text-sm text-white/30">/month</span>
                  </div>
                  <Link
                    href="/dashboard"
                    className="btn-gold-slide block w-full py-4 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-white"
                  >
                    Start 7-Day Free Trial
                  </Link>
                  <p className="mt-4 text-center text-[10px] text-white/30 uppercase tracking-[0.2em]">
                    No credit card needed &middot; Cancel anytime
                  </p>
                </>
              )}
            </div>
          </Reveal>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="px-6 pb-24 sm:pb-32">
          <Reveal>
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="font-headline text-4xl sm:text-6xl leading-[0.95]">
                {WAITLIST ? "Everyone else is still scrolling headlines." : "Your briefing is already waiting."}
              </h2>
              <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-[#1A1A1A]/50">
                {WAITLIST ? "Join the waitlist and be the first to know when we launch." : "Open tikrr. Read one summary. Know everything."}
              </p>
              <div className="mt-10 flex justify-center">
                {WAITLIST ? (
                  <WaitlistForm />
                ) : (
                  <Link
                    href="/dashboard"
                    className="btn-gold-slide px-12 py-4 text-[10px] font-bold uppercase tracking-[0.3em]"
                  >
                    Open Dashboard
                  </Link>
                )}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1A1A1A] px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-headline text-sm font-black tracking-tighter">ti<span className="text-[#D4AF37]">k</span>rr</span>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#1A1A1A]/30">&copy; {new Date().getFullYear()} tikrr</p>
        </div>
      </footer>
    </div>
  );
}
