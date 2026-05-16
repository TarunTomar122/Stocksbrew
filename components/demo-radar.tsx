"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { StockLogo } from "@/components/stock-logo";

// Demo content for unsigned-in users. Designed to communicate value at a
// glance: top AI directive, ledger preview, portfolio diagnosis snippet,
// alerts strip — wrapped in a persistent "sign in to start" CTA.

type DemoRow = {
  ticker: string;
  name: string;
  logoUrl: string;
  position: "holding" | "watching";
  price: number;
  changePct: number;
  changeAbs: number;
  score: number;
  stance: "accumulate" | "trim" | "watch" | "avoid" | "hold";
  stanceLabel: string;
  signals: string[];
};

const DEMO_ROWS: DemoRow[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    logoUrl: "https://logo.clearbit.com/nvidia.com",
    position: "holding",
    price: 131.38,
    changePct: 2.64,
    changeAbs: 3.38,
    score: 74,
    stance: "accumulate",
    stanceLabel: "Accumulate",
    signals: ["RSI 68"],
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    logoUrl: "https://logo.clearbit.com/microsoft.com",
    position: "holding",
    price: 421.92,
    changePct: 3.05,
    changeAbs: 12.49,
    score: 84,
    stance: "accumulate",
    stanceLabel: "Accumulate",
    signals: ["Earnings May 20"],
  },
  {
    ticker: "INTC",
    name: "Intel",
    logoUrl: "https://logo.clearbit.com/intel.com",
    position: "holding",
    price: 108.77,
    changePct: -6.18,
    changeAbs: -7.16,
    score: 52,
    stance: "avoid",
    stanceLabel: "Avoid",
    signals: [],
  },
  {
    ticker: "AMD",
    name: "AMD",
    logoUrl: "https://logo.clearbit.com/amd.com",
    position: "holding",
    price: 424.10,
    changePct: -5.69,
    changeAbs: -25.6,
    score: 75,
    stance: "trim",
    stanceLabel: "Trim",
    signals: [],
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    logoUrl: "https://logo.clearbit.com/meta.com",
    position: "watching",
    price: 614.23,
    changePct: -0.68,
    changeAbs: -4.20,
    score: 78,
    stance: "accumulate",
    stanceLabel: "Accumulate",
    signals: ["RSI 30"],
  },
];

const STANCE_META: Record<DemoRow["stance"], { bg: string; fg: string; dot: string }> = {
  accumulate: { bg: "#ecfdf5", fg: "#065f46", dot: "#10b981" },
  trim:       { bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b" },
  watch:      { bg: "#eff6ff", fg: "#1e3a8a", dot: "#0052ff" },
  avoid:      { bg: "#fef2f2", fg: "#991b1b", dot: "#ef4444" },
  hold:       { bg: "#f3f4f6", fg: "#374151", dot: "#374151" },
};

function scoreColor(s: number): string {
  if (s >= 80) return "text-[#10b981]";
  if (s >= 60) return "text-[#111111]";
  if (s >= 40) return "text-[#6b7280]";
  return "text-[#ef4444]";
}

function fmtPrice(v: number): string {
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: v >= 1000 ? 0 : 2,
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  })}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

async function syncServerSession(): Promise<void> {
  const u = getFirebaseAuth().currentUser;
  if (!u) return;
  const idToken = await u.getIdToken();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

export function DemoRadar() {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function startSignIn() {
    if (user) {
      router.refresh();
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      await syncServerSession().catch(() => undefined);
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  const top = DEMO_ROWS[1]; // MSFT — Accumulate, the showcase directive
  const holdings = DEMO_ROWS.filter((r) => r.position === "holding");
  const watching = DEMO_ROWS.filter((r) => r.position === "watching");

  return (
    <main className="flex-grow bg-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-12 px-3 sm:px-6 md:px-20 lg:px-32 py-6 lg:py-10">

        {/* ── DEMO BANNER ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-[#fafaf7] p-5 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-[#e5e7eb] text-[16px]">👁</span>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Preview · Demo Radar</span>
              <p className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em]">
                This is what your Radar looks like.
              </p>
              <p className="text-[13px] text-[#6b7280] leading-snug">
                Sign in to start tracking your own stocks — free for the first 3.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startSignIn}
            disabled={busy}
            className="shrink-0 inline-flex items-center justify-center h-[42px] px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
          >
            {busy ? "Signing you in…" : "Sign in & start your Radar →"}
          </button>
        </div>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <header className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#9ca3af]">
            tikrr · demo
          </span>
          <h1 className="text-[32px] md:text-[40px] font-semibold tracking-[-0.025em] text-[#0a0a0a] leading-none">
            Radar
          </h1>
          <p className="text-[12.5px] text-[#6b7280]">
            5 tickers on demo · refreshed just now · sample data
          </p>
        </header>

        {/* ── § 01 · TODAY (one primary directive + secondary grid) ───────── */}
        <section className="flex flex-col gap-6">
          <SectionOpener number="01" title="Today" />

          <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">
            Tech holds up despite Intel&apos;s slide. Microsoft strength offsets AMD chop, and Meta&apos;s pullback into oversold could be your re-entry window.
          </p>

          {/* Primary directive — feature card */}
          <div className="flex flex-col gap-3">
            <DirectiveHeader row={top} eyebrow="Today's top directive" />
            <PrimaryDirectiveCard row={top} />
          </div>

          {/* Secondary directive grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {DEMO_ROWS.filter((r) => r.ticker !== top.ticker).slice(0, 4).map((r) => (
              <SecondaryDirectiveCard key={r.ticker} row={r} />
            ))}
          </div>
        </section>

        {/* ── § 02 · YOUR BOOK (ledger + rail) ────────────────────────────── */}
        <section className="flex flex-col gap-6">
          <SectionOpener
            number="02"
            title="Your book"
            meta={`${holdings.length} held · ${watching.length} watching`}
          />

          <div className="flex flex-col gap-4">
            {/* Tab pills (demo — Holdings is active) */}
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold bg-[#111111] text-white">
                Holdings <span className="text-white/70 text-[10px] tabular-nums">{holdings.length}</span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold bg-[#f3f4f6] text-[#374151]">
                Watching <span className="text-[#9ca3af] text-[10px] tabular-nums">{watching.length}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
              {/* Ledger */}
              <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
                {/* Desktop table */}
                <table className="hidden md:table w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-[#f3f4f6] text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-3 py-3 text-right">Price</th>
                      <th className="px-3 py-3 text-right">Change</th>
                      <th className="px-3 py-3 text-right">Score</th>
                      <th className="px-4 py-3">Directive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((r) => (
                      <LedgerRow key={r.ticker} row={r} />
                    ))}
                  </tbody>
                </table>

                {/* Mobile cards */}
                <div className="md:hidden">
                  {holdings.map((r, i) => (
                    <MobileLedgerRow key={r.ticker} row={r} hasBorder={i > 0} />
                  ))}
                </div>
              </div>

              {/* Right rail: Up Next + Alerts */}
              <div className="flex flex-col gap-4">
                <RailPanel
                  emoji="⏰"
                  iconBg="#eff6ff"
                  iconColor="#1e3a8a"
                  label="Up Next"
                  count={2}
                >
                  <RailItem ticker="MSFT" body="Earnings May 20 AMC" tag="SOON" />
                  <RailItem ticker="NVDA" body="Earnings May 28 AMC" tag="SOON" hasBorder />
                </RailPanel>

                <RailPanel
                  emoji="🔔"
                  iconBg="#fef2f2"
                  iconColor="#b91c1c"
                  label="Alerts"
                  count={4}
                >
                  <RailItem ticker="INTC" body="Moved -6.18% today" hasBorder={false} dotColor="#ef4444" />
                  <RailItem ticker="AMD" body="Moved -5.69% today" hasBorder dotColor="#ef4444" />
                  <RailItem ticker="META" body="RSI indicates oversold" hasBorder dotColor="#f59e0b" />
                  <RailItem ticker="NVDA" body="RSI approaching overbought" hasBorder dotColor="#f59e0b" />
                </RailPanel>
              </div>
            </div>
          </div>
        </section>

        {/* ── § 03 · DIAGNOSIS ────────────────────────────────────────────── */}
        <section className="flex flex-col gap-8">
          <SectionOpener number="03" title="Diagnosis" />

          <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">
            Your portfolio scores strong on Quality and Momentum, but 80% of holdings are clustered in Technology. One macro shock and they all move together.
          </p>

          {/* Score + pillars */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 items-center">
            <div className="flex flex-col items-center md:items-start gap-1">
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">Portfolio score</span>
              <span className="text-[56px] md:text-[64px] font-semibold tabular-nums leading-none text-[#10b981]">72</span>
              <span className="text-[12.5px] text-[#6b7280]">Avg overall · 5 stocks</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Valuation", score: 58, hint: "Slightly stretched" },
                { label: "Growth",    score: 78, hint: "Strong" },
                { label: "Quality",   score: 82, hint: "Top-tier" },
                { label: "Momentum",  score: 68, hint: "Mixed" },
              ].map((p) => (
                <PillarCard key={p.label} label={p.label} score={p.score} hint={p.hint} />
              ))}
            </div>
          </div>

          {/* Risk flags */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#fef2f2] text-[14px]">⚠️</span>
              <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#b91c1c]">Risk flags</span>
              <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">3</span>
            </div>
            <div className="flex flex-col gap-2">
              {[
                {
                  title: "Sector concentration",
                  scope: "portfolio",
                  severity: "medium",
                  body: "80% clustered in Technology. A single macro shock — rising yields, AI capex fears, China export curbs — moves all five names at once.",
                  bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b",
                },
                {
                  title: "INTC earnings drag",
                  scope: "INTC",
                  severity: "high",
                  body: "Intel missed on revenue and guided lower. Until there's a credible foundry turnaround narrative, the stock is dead money with downside risk.",
                  bg: "#fef2f2", fg: "#991b1b", dot: "#ef4444",
                },
                {
                  title: "AMD resistance at $430",
                  scope: "AMD",
                  severity: "low",
                  body: "AMD has failed three times at the $430 level this month. Holding through that zone exposes you to a swift 8–12% pullback on a broad market sell-off.",
                  bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b",
                },
              ].map((flag) => (
                <div key={flag.title} className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-[#0a0a0a]">
                      {flag.title}
                      <span className="ml-2 text-[11px] font-medium text-[#9ca3af] tracking-[0.04em] uppercase">{flag.scope}</span>
                    </span>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase"
                      style={{ background: flag.dot, color: "#fff" }}
                    >
                      <span aria-hidden className="h-1 w-1 rounded-full bg-white/80" />
                      {flag.severity}
                    </span>
                  </div>
                  <p className="text-[14px] leading-[1.6] mt-2 text-[#374151]">{flag.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sector clusters */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#eff6ff] text-[14px]">🗂</span>
              <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#1e3a8a]">Sector clusters</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { sector: "Semiconductors", tickers: ["NVDA", "INTC", "AMD"], weight: "60%", note: "Correlated on AI capex cycles", color: "#4f46e5" },
                { sector: "Cloud & Software", tickers: ["MSFT"], weight: "20%", note: "Steady compounder; low correlation to semis", color: "#0052ff" },
                { sector: "Social / Ads", tickers: ["META"], weight: "20%", note: "Ad revenue tied to consumer sentiment", color: "#7c3aed" },
              ].map((c) => (
                <div key={c.sector} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[#111111]">{c.sector}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-[#374151]">{c.weight}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#f3f4f6] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: c.weight, background: c.color }} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.tickers.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold bg-[#f3f4f6] text-[#374151]">
                        <StockLogo ticker={t} logoUrl={`https://logo.clearbit.com/${t === "NVDA" ? "nvidia.com" : t === "INTC" ? "intel.com" : t === "AMD" ? "amd.com" : t === "MSFT" ? "microsoft.com" : "meta.com"}`} market="US" size={12} />
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#6b7280] leading-snug">{c.note}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Opportunities */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#ecfdf5] text-[14px]">💡</span>
              <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#065f46]">Opportunities in your book</span>
              <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">2</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  ticker: "META",
                  logoUrl: "https://logo.clearbit.com/meta.com",
                  label: "Dip entry window",
                  body: "RSI has dropped to 30 — historically a reliable bounce zone for META. Advertisers are re-accelerating spend into Q3. Risk/reward here skews 3:1 in your favor.",
                  confidence: "High",
                  confColor: "#10b981",
                },
                {
                  ticker: "MSFT",
                  logoUrl: "https://logo.clearbit.com/microsoft.com",
                  label: "Pre-earnings accumulate",
                  body: "Azure growth reacceleration expected in the May 20 print. Copilot monetization is just starting. Adding before earnings captures potential 5–8% gap-up.",
                  confidence: "Medium",
                  confColor: "#f59e0b",
                },
              ].map((op) => (
                <div key={op.ticker} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StockLogo ticker={op.ticker} logoUrl={op.logoUrl} market="US" size={28} />
                      <div className="flex flex-col">
                        <span className="text-[13px] font-semibold text-[#111111]">{op.ticker}</span>
                        <span className="text-[11px] text-[#9ca3af]">{op.label}</span>
                      </div>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase"
                      style={{ background: op.confColor + "22", color: op.confColor }}
                    >
                      <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: op.confColor }} />
                      {op.confidence}
                    </span>
                  </div>
                  <p className="text-[13px] leading-[1.6] text-[#374151]">{op.body}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Stocks to check out */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f3ff] text-[14px]">🔭</span>
              <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#6d28d9]">Stocks to check out</span>
              <span className="text-[10px] text-[#9ca3af]">Based on your current holdings</span>
            </div>
            <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
              {[
                { ticker: "TSM", name: "TSMC", logoUrl: "https://logo.clearbit.com/tsmc.com", price: 178.40, changePct: 1.22, reason: "Your semis cluster needs a non-US name for geopolitical hedge. TSMC manufactures chips for every stock you hold.", score: 81 },
                { ticker: "GOOGL", name: "Alphabet", logoUrl: "https://logo.clearbit.com/google.com", price: 172.63, changePct: 0.55, reason: "Adds AI cloud exposure outside Azure. Diversifies your cloud leg without leaving the tech sector.", score: 76 },
                { ticker: "AMZN", name: "Amazon", logoUrl: "https://logo.clearbit.com/amazon.com", price: 205.71, changePct: -0.31, reason: "AWS growth re-accelerating. Consumer + cloud combo gives you a lower-correlated tech compounder.", score: 79 },
              ].map((s, i) => {
                const positive = s.changePct >= 0;
                return (
                  <div key={s.ticker} className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-[#f3f4f6]" : ""}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <StockLogo ticker={s.ticker} logoUrl={s.logoUrl} market="US" size={32} />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-[#111111]">{s.ticker}</span>
                          <span className="text-[11px] text-[#9ca3af]">{s.name}</span>
                        </div>
                        <span className="text-[12px] text-[#6b7280] leading-snug line-clamp-1">{s.reason}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">${s.price.toFixed(2)}</span>
                        <span className={`text-[11px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
                          {fmtPct(s.changePct)}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`text-[14px] font-semibold tabular-nums ${scoreColor(s.score)}`}>{s.score}</span>
                        <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">score</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ──────────────────────────────────────────────────── */}
        <section className="rounded-3xl border border-[#e5e7eb] bg-[#fafaf7] p-8 md:p-10 flex flex-col items-center text-center gap-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-white border border-[#e5e7eb] px-3 py-1 text-[11px] font-semibold tracking-[0.04em] text-[#374151]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            Free for 3 stocks · No credit card
          </span>
          <h2 className="text-[26px] md:text-[34px] font-semibold tracking-[-0.025em] text-[#0a0a0a] max-w-[640px] leading-[1.15]">
            Track your own stocks. Get a directive on each one every morning.
          </h2>
          <p className="text-[14px] text-[#6b7280] max-w-[480px] leading-snug">
            Sign in with Google in 2 seconds. We&apos;ll auto-build your Radar based on what you track.
          </p>
          <button
            type="button"
            onClick={startSignIn}
            disabled={busy}
            className="inline-flex items-center justify-center h-12 px-7 rounded-full bg-[#111111] text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
          >
            {busy ? "Signing you in…" : "Sign in & build your Radar →"}
          </button>
        </section>

      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Sub-components — minimal versions matching the real Radar's visual language
// -----------------------------------------------------------------------------

function SectionOpener({ number, title, meta }: { number: string; title: string; meta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#e5e7eb] pt-8">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">§ {number}</span>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#111111]">{title}</h2>
      </div>
      {meta && <span className="text-[12px] text-[#9ca3af]">{meta}</span>}
    </div>
  );
}

function DirectiveHeader({ row, eyebrow }: { row: DemoRow; eyebrow: string }) {
  const positive = row.changePct >= 0;
  return (
    <div className="inline-flex items-center gap-3 self-start">
      <StockLogo ticker={row.ticker} logoUrl={row.logoUrl} market="US" size={36} />
      <div className="flex flex-col gap-0">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-semibold tracking-[-0.01em] text-[#0a0a0a]">{row.ticker}</span>
          <span className="text-[12px] text-[#9ca3af]">Technology</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase bg-[#ecfdf5] text-[#047857]">
            <span aria-hidden className="h-1 w-1 rounded-full bg-[#10b981]" />
            Holding
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-[#0a0a0a]">{fmtPrice(row.price)}</span>
          <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#047857]" : "text-[#b91c1c]"}`}>
            {fmtPct(row.changePct)}
          </span>
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
            {eyebrow}
          </span>
        </div>
      </div>
    </div>
  );
}

function PrimaryDirectiveCard({ row }: { row: DemoRow }) {
  const meta = STANCE_META[row.stance];
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[#e5e7eb] p-6 md:p-8 flex flex-col gap-4"
      style={{ background: meta.bg }}
    >
      <span
        aria-hidden
        className="absolute right-4 top-4 select-none text-[120px] font-semibold tracking-tighter leading-none opacity-[0.06]"
        style={{ color: meta.fg }}
      >
        {row.ticker}
      </span>
      <div className="flex items-center justify-between flex-wrap gap-3 relative z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] uppercase"
            style={{ background: meta.dot, color: "#ffffff" }}
          >
            {row.stanceLabel}
          </span>
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: meta.fg, opacity: 0.75 }}>
            Strategic directive · High
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "#0052ff" }}>
          🔔 Set alert above $410.00
        </span>
      </div>
      <h3 className="text-[28px] md:text-[34px] font-semibold tracking-[-0.02em] leading-[1.15] max-w-[680px] relative z-10" style={{ color: meta.fg }}>
        Accumulate on dips below $410
      </h3>
      <p className="text-[14px] md:text-[15px] leading-[1.6] max-w-[680px] relative z-10" style={{ color: meta.fg, opacity: 0.85 }}>
        A value icon is buying, quality metrics are elite, and the stock is the Dow&apos;s worst performer today — creating a tactical entry point.
      </p>
    </div>
  );
}

function SecondaryDirectiveCard({ row }: { row: DemoRow }) {
  const meta = STANCE_META[row.stance];
  const positive = row.changePct >= 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase"
          style={{ background: meta.dot, color: "#ffffff" }}
        >
          {row.stanceLabel}
        </span>
        <span className={`text-[11px] font-semibold tabular-nums ${positive ? "text-[#047857]" : "text-[#b91c1c]"}`}>
          {fmtPct(row.changePct)}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logoUrl} market="US" size={32} />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-[#0a0a0a]">{row.ticker}</span>
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em] uppercase bg-[#f3f4f6] text-[#6b7280]">
              {row.position === "holding" ? "Holding" : "Watching"}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-semibold tabular-nums text-[#374151]">{fmtPrice(row.price)}</span>
            <span className="text-[11px] text-[#9ca3af] truncate max-w-[100px]">Technology</span>
          </div>
        </div>
      </div>
      <p className="text-[13px] font-medium text-[#0a0a0a] leading-snug line-clamp-2 mt-auto">
        {row.stance === "accumulate" ? "Accumulate on dips below recent support." :
         row.stance === "trim"       ? "Trim into strength above resistance." :
         row.stance === "avoid"      ? "Avoid until turnaround shows in earnings." :
                                       "Watch for entry near support."}
      </p>
    </div>
  );
}

function LedgerRow({ row }: { row: DemoRow }) {
  const positive = row.changePct >= 0;
  const meta = STANCE_META[row.stance];
  return (
    <tr className="border-b border-[#f3f4f6] last:border-b-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <StockLogo ticker={row.ticker} logoUrl={row.logoUrl} market="US" size={28} />
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-[#111111] leading-none">{row.ticker}</span>
            {row.signals.length > 0 && (
              <div className="flex gap-1">
                {row.signals.map((s, i) => (
                  <span key={i} className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold bg-[#fef2f2] text-[#b91c1c]">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-[13px] font-semibold tabular-nums text-[#111111]">{fmtPrice(row.price)}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className={`text-[13px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {fmtPct(row.changePct)}
          </span>
          <span className={`text-[11px] tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {row.changeAbs >= 0 ? "+" : "-"}${Math.abs(row.changeAbs).toFixed(2)}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span className={`text-[14px] font-semibold tabular-nums ${scoreColor(row.score)}`}>{row.score}</span>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em]"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
          {row.stanceLabel}
        </span>
      </td>
    </tr>
  );
}

function MobileLedgerRow({ row, hasBorder }: { row: DemoRow; hasBorder: boolean }) {
  const positive = row.changePct >= 0;
  const meta = STANCE_META[row.stance];
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3.5 ${hasBorder ? "border-t border-[#f3f4f6]" : ""}`}>
      <div className="flex items-center gap-2.5">
        <StockLogo ticker={row.ticker} logoUrl={row.logoUrl} market="US" size={36} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-[#111111]">{row.ticker}</span>
          <span
            className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ background: meta.bg, color: meta.fg }}
          >
            <span aria-hidden className="h-1 w-1 rounded-full" style={{ background: meta.dot }} />
            {row.stanceLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[14px] font-semibold tabular-nums text-[#111111]">{fmtPrice(row.price)}</span>
        <span className={`text-[12px] font-semibold tabular-nums ${positive ? "text-[#10b981]" : "text-[#ef4444]"}`}>
          {fmtPct(row.changePct)}
        </span>
      </div>
    </div>
  );
}

function RailPanel({
  emoji, iconBg, iconColor, label, count, children,
}: {
  emoji: string;
  iconBg: string;
  iconColor: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#f3f4f6]">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[14px]" style={{ background: iconBg }}>{emoji}</span>
          <span className="text-[11px] font-semibold tracking-[0.1em] uppercase" style={{ color: iconColor }}>{label}</span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af]">{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function RailItem({ ticker, body, tag, hasBorder = false, dotColor }: { ticker: string; body: string; tag?: string; hasBorder?: boolean; dotColor?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${hasBorder ? "border-t border-[#f3f4f6]" : ""}`}>
      <div className="flex items-start gap-2 min-w-0">
        {dotColor && (
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-[#111111]">{ticker}</span>
          <span className="text-[12px] text-[#6b7280] truncate">{body}</span>
        </div>
      </div>
      {tag && (
        <span className="shrink-0 text-[10px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af]">{tag}</span>
      )}
    </div>
  );
}

function PillarCard({ label, score, hint }: { label: string; score: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">{label}</span>
      <span className={`text-[28px] font-semibold tabular-nums leading-none ${scoreColor(score)}`}>{score}</span>
      <span className="text-[11px] text-[#6b7280]">{hint}</span>
    </div>
  );
}
