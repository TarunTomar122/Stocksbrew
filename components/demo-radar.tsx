"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { StockLogo } from "@/components/stock-logo";
import { ConnectedReadCard } from "@/components/connected-read-card";

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

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function DemoRadar() {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 220);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function startSignIn() {
    if (user) { router.refresh(); return; }
    setBusy(true);
    try {
      await signInWithGoogle();
      await syncServerSession().catch(() => undefined);
      router.refresh();
    } catch { setBusy(false); }
  }

  const top = DEMO_ROWS[1]; // MSFT — best showcase directive
  const secondary = DEMO_ROWS.filter((r) => r.ticker !== top.ticker);

  return (
    <main className="flex-grow bg-white">

      {/* ── STICKY CONVERSION BAR ────────────────────────────────────────────── */}
      <div
        className={`fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 px-4 sm:px-8 h-12 bg-[#0a0a0a] transition-transform duration-300 ease-out ${
          scrolled ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] shrink-0" />
          <span className="text-[12px] text-white/50 truncate hidden sm:block">
            You&apos;re viewing a sample. Sign in to get this for your own stocks
          </span>
        </div>
        <button
          type="button"
          onClick={startSignIn}
          disabled={busy}
          className="shrink-0 h-7 px-4 rounded-full bg-white text-[#0a0a0a] text-[11px] font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Get your free Radar →"}
        </button>
      </div>

      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-6 md:px-20 lg:px-32 py-8 lg:py-12 flex flex-col gap-12">

        {/* ── HERO HEADER ─────────────────────────────────────────────────────── */}
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">

          {/* Left: label + title + description */}
          <div className="flex flex-col gap-4 max-w-[580px]">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#fafafa] px-3 py-1">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#f59e0b] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
              </span>
              <span className="text-[11px] font-semibold text-[#374151]">Sample portfolio · refreshed this morning</span>
            </div>

            <div className="flex flex-col gap-1">
              <h1 className="text-[40px] md:text-[56px] font-semibold tracking-[-0.035em] text-[#0a0a0a] leading-[1.0]">
                Your Radar
              </h1>
              <p className="text-[15px] text-[#6b7280] leading-[1.65] mt-3">
                Every morning we read the buzz, the moves, the earnings, and the sector regime on
                the stocks you own, then tell you what it all adds up to and what to do about it.
                This is what yours could look like.
              </p>
            </div>

            <button
              type="button"
              onClick={startSignIn}
              disabled={busy}
              className="self-start inline-flex items-center justify-center h-11 px-6 rounded-full bg-[#0a0a0a] text-white text-[13px] font-semibold hover:bg-black transition-colors disabled:opacity-60 shadow-[0_2px_16px_rgba(0,0,0,0.15)]"
            >
              {busy ? "Signing you in…" : "Sign in free, takes 30 seconds →"}
            </button>
          </div>

          {/* Right: a connected read — signals chaining into a call */}
          <div className="flex w-full flex-col gap-2 md:max-w-[400px] shrink-0">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#9ca3af]">
              This morning on this book
            </span>
            <ConnectedReadCard
              ticker="NVDA"
              name="NVIDIA Corp"
              market="US"
              logoUrl={null}
              chips={[
                { kind: "buzz", label: "Reddit buzz" },
                { kind: "anomaly_up", label: "Up 6.4%" },
                { kind: "regime", label: "Momentum" },
              ]}
              conclusion="Accumulate on dips below 210. The setup is strong, just do not chase the breakout here."
            />
          </div>
        </header>

        {/* ── § 01 · TODAY ────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-6">
          <div className="flex items-baseline gap-3 border-t border-[#f3f4f6] pt-8">
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">§ 01</span>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-[#111111]">Today</h2>
          </div>

          <p className="text-[15px] md:text-[16px] text-[#374151] leading-[1.6] max-w-[820px]">
            Tech holds up despite Intel&apos;s slide. Microsoft strength offsets AMD chop, and Meta&apos;s pullback into oversold territory could be your re-entry window.
          </p>

          {/* Primary directive — fully visible, this is the showpiece */}
          <div className="flex flex-col gap-3">
            <DirectiveHeader row={top} eyebrow="Today's top directive" />
            <PrimaryDirectiveCard row={top} />
          </div>

          {/* Secondary directive grid — fades out to tease the gate */}
          <div className="relative">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {secondary.map((r, i) => (
                <div
                  key={r.ticker}
                  className={i >= 2 ? "pointer-events-none select-none" : ""}
                  style={{ opacity: i === 0 ? 1 : i === 1 ? 0.6 : 0.25 }}
                >
                  <SecondaryDirectiveCard row={r} />
                </div>
              ))}
            </div>
            {/* Gradient fade — pulls the eye down into the gate */}
            <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-white to-transparent pointer-events-none" />
          </div>
        </section>

        {/* ── CONVERSION GATE ─────────────────────────────────────────────────── */}
        <section className="-mt-4 flex flex-col items-center gap-7 text-center pt-4 pb-16 px-4">

          {/* What's locked — chip row */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              "A call on every stock",
              "Anomalies on your book",
              "Reddit buzz on your names",
              "Sector regime read",
              "Pre-earnings setups",
            ].map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#374151] shadow-sm"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <rect x="2.5" y="4.5" width="5" height="4" rx="1" stroke="#9ca3af" strokeWidth="1.1" />
                  <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5" stroke="#9ca3af" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                {label}
              </span>
            ))}
          </div>

          {/* Headline */}
          <div className="flex flex-col gap-3 max-w-[520px]">
            <h2 className="text-[30px] md:text-[40px] font-semibold tracking-[-0.03em] text-[#0a0a0a] leading-[1.1]">
              Make this yours.<br />
              <span className="text-[#10b981]">It takes 30 seconds.</span>
            </h2>
            <p className="text-[14px] text-[#6b7280] leading-[1.6]">
              Add the stocks you own and watch. stocksbrew builds a personalized Radar overnight with
              a full directive on every holding, risk flags, and opportunities, waiting for you
              each morning. Free for 3 stocks, no credit card.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 w-full max-w-[380px]">
            <button
              type="button"
              onClick={startSignIn}
              disabled={busy}
              className="w-full inline-flex items-center justify-center h-13 px-8 rounded-full bg-[#0a0a0a] text-white text-[15px] font-semibold hover:bg-black transition-colors disabled:opacity-60 shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
              style={{ height: "52px" }}
            >
              {busy ? "Signing you in…" : "Sign in with Google, it's free →"}
            </button>
            <p className="text-[12px] text-[#9ca3af]">
              Free for 3 stocks &nbsp;·&nbsp; No credit card &nbsp;·&nbsp; Cancel anytime
            </p>
          </div>

          {/* Social proof row */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-[#9ca3af]">
            {[
              { icon: "✓", text: "Directives delivered every morning" },
              { icon: "✓", text: "Personalized to what you own" },
              { icon: "✓", text: "Upgrade anytime for unlimited stocks" },
            ].map((item) => (
              <span key={item.text} className="flex items-center gap-1.5">
                <span className="text-[#10b981] font-semibold">{item.icon}</span>
                {item.text}
              </span>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

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
      {/* Watermark ticker */}
      <span
        aria-hidden
        className="absolute right-4 top-2 select-none text-[120px] font-semibold tracking-tighter leading-none opacity-[0.06]"
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
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase" style={{ color: meta.fg, opacity: 0.7 }}>
            Strategic directive · High confidence
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "#0052ff" }}>
          🔔 Set alert above $410.00
        </span>
      </div>

      <h3
        className="text-[28px] md:text-[36px] font-semibold tracking-[-0.025em] leading-[1.15] max-w-[680px] relative z-10"
        style={{ color: meta.fg }}
      >
        Accumulate on dips below $410
      </h3>

      <p
        className="text-[14px] md:text-[15px] leading-[1.65] max-w-[680px] relative z-10"
        style={{ color: meta.fg, opacity: 0.82 }}
      >
        A value icon is buying, quality metrics are elite, and the stock is the Dow&apos;s
        worst performer today, creating a tactical entry point ahead of the May 20 earnings print.
      </p>

      {/* Signal chips */}
      <div className="flex flex-wrap gap-2 relative z-10">
        {["RSI cooling from 72 → 61", "Earnings May 20 AMC", "Insider buying $2.1M"].map((s) => (
          <span
            key={s}
            className="inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: meta.fg + "18", color: meta.fg }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function SecondaryDirectiveCard({ row }: { row: DemoRow }) {
  const meta = STANCE_META[row.stance];
  const positive = row.changePct >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-3 h-full">
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
            <span className="text-[11px] text-[#9ca3af]">Technology</span>
          </div>
        </div>
      </div>

      <p className="text-[13px] font-medium text-[#0a0a0a] leading-snug mt-auto">
        {row.stance === "accumulate" ? "Accumulate on dips below recent support." :
         row.stance === "trim"       ? "Trim into strength above resistance." :
         row.stance === "avoid"      ? "Avoid until turnaround shows in earnings." :
                                       "Watch for entry near support."}
      </p>
    </div>
  );
}
