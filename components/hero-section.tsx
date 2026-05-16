"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { StockLogo } from "@/components/stock-logo";
import type { HeroVerdict } from "@/lib/hero-verdict";

type IndexData = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type Props = {
  indices: IndexData[];
  verdict?: HeroVerdict | null;
  isSubscribed?: boolean;
};

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
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

const DEMO_VERDICT: HeroVerdict = {
  ticker: "NVDA",
  name: "NVIDIA Corporation",
  price: 131.38,
  changePct: 2.64,
  level: "Buy signal",
  shortLabel: "BUY",
  color: "#10b981",
  bg: "#ecfdf5",
  textColor: "#065f46",
  overall: 74,
  oneLiner: "Up 2.6% today · momentum strong · valuation reasonable.",
  logoUrl: "https://logo.clearbit.com/nvidia.com",
};

export function HeroSection({ indices, verdict, isSubscribed = false }: Props) {
  const displayVerdict = verdict ?? DEMO_VERDICT;
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function startTracking() {
    if (user) {
      router.push("/watchlist");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      await syncServerSession().catch(() => undefined);
      router.push("/watchlist");
    } catch (err) {
      console.error("sign-in failed", err);
      setBusy(false);
    }
  }

  const displayIndices = indices.slice(0, 5);

  return (
    <section className="w-full overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-14 items-center pt-10 md:pt-14 pb-10">

        {/* LEFT: copy + CTA */}
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1 text-[12px] font-medium text-[#374151]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            For people who own stocks
          </span>

          <h1 className="text-[40px] md:text-[52px] lg:text-[60px] font-semibold text-[#111111] tracking-[-0.04em] leading-[1.02]">
            What to do with your stocks. <br />Every morning.
          </h1>

          <p className="text-[16px] md:text-[17px] text-[#6b7280] leading-[1.55] max-w-[480px]">
            AI verdicts on each stock. Portfolio risks flagged. Market anomalies surfaced. In plain English.
          </p>

          <div className="flex flex-col items-start gap-2.5">
            <button
              type="button"
              onClick={startTracking}
              disabled={busy}
              className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-[#111111] text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
            >
              {busy ? "Opening..." : user ? "Open your Radar" : "Track your first stock - free"}
            </button>
            {!isSubscribed && (
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                {["Free for 3 stocks", "No credit card", "Pro unlocks unlimited + alerts"].map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 text-[11.5px] text-[#9ca3af]">
                    <span className="h-1 w-1 rounded-full bg-[#d1d5db]" />
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: three-pillar preview — verdict / radar / anomaly */}
        <div className="flex flex-col gap-3 w-full">
          {/* TILE 1 — Per-stock verdict */}
          <Link
            href={`/stock/${encodeURIComponent(displayVerdict.ticker)}`}
            className="group relative w-full rounded-2xl border border-[#e5e7eb] bg-white p-4 md:p-5 text-left transition-all hover:border-[#111111] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                01 · Per-stock verdict
              </span>
              <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                tikrr
              </span>
            </div>

            <div className="flex items-center gap-3">
              <StockLogo
                ticker={displayVerdict.ticker}
                logoUrl={displayVerdict.logoUrl}
                market="US"
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[16px] font-semibold text-[#111111]">
                    {displayVerdict.ticker}
                  </span>
                  <span className="text-[11px] text-[#9ca3af] truncate">
                    {displayVerdict.name}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-[13px] font-semibold tabular-nums text-[#111111]">
                    ${fmtPrice(displayVerdict.price)}
                  </span>
                  {typeof displayVerdict.changePct === "number" && (
                    <span
                      className="text-[12px] font-semibold tabular-nums"
                      style={{ color: displayVerdict.changePct >= 0 ? "#10b981" : "#ef4444" }}
                    >
                      {fmtPct(displayVerdict.changePct)}
                    </span>
                  )}
                </div>
              </div>
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: displayVerdict.bg }}
              >
                <span
                  className="text-[14px] font-semibold tracking-[-0.01em] leading-none"
                  style={{ color: displayVerdict.textColor }}
                >
                  {displayVerdict.shortLabel}
                </span>
                <span
                  aria-hidden
                  className="h-3 w-px"
                  style={{ background: displayVerdict.textColor, opacity: 0.3 }}
                />
                <span
                  className="text-[14px] font-semibold tabular-nums leading-none"
                  style={{ color: displayVerdict.textColor }}
                >
                  {displayVerdict.overall}
                </span>
              </div>
            </div>

            <p className="mt-3 text-[12.5px] text-[#374151] leading-[1.45] line-clamp-2">
              {displayVerdict.oneLiner}
            </p>
          </Link>

          {/* TILE 2 — Your Radar */}
          <Link
            href="/watchlist"
            className="group relative w-full rounded-2xl border border-[#e5e7eb] bg-white p-4 md:p-5 text-left transition-all hover:border-[#111111] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#0052ff]" />
                02 · Your Radar
              </span>
              <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                portfolio
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#fef3c7] px-2 py-1 text-[11px] font-semibold text-[#92400e]">
                <span aria-hidden>⚠</span>
                67% in Technology
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#eff6ff] px-2 py-1 text-[11px] font-semibold text-[#1e3a8a]">
                <span aria-hidden>🎯</span>
                3 opportunities
              </span>
            </div>

            <p className="mt-3 text-[12.5px] text-[#374151] leading-[1.45] line-clamp-2">
              <span className="font-semibold text-[#111111]">AMD broke out</span> · NVDA RSI at 78 · MSFT earnings May 20 AMC
            </p>
          </Link>

          {/* TILE 3 — Market anomaly */}
          <Link
            href="/anomalies"
            className="group relative w-full rounded-2xl border border-[#e5e7eb] bg-white p-4 md:p-5 text-left transition-all hover:border-[#111111] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#ef4444]" />
                03 · Market anomaly
              </span>
              <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                today
              </span>
            </div>

            <div className="flex items-center gap-3">
              <StockLogo
                ticker="PLTR"
                market="US"
                size={36}
                logoUrl="https://logo.clearbit.com/palantir.com"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[15px] font-semibold text-[#111111]">PLTR</span>
                  <span className="text-[13px] font-semibold tabular-nums text-[#10b981]">+12.3%</span>
                </div>
                <p className="text-[12px] text-[#6b7280] leading-snug truncate">
                  Unusual call volume · 3× average flow
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af] group-hover:text-[#111111] group-hover:translate-x-0.5 transition-all">
                See all →
              </span>
            </div>
          </Link>
        </div>
      </div>

      {/* Index strip */}
      {displayIndices.length > 0 && (
        <div className="border-t border-[#f3f4f6] py-4 flex items-center justify-center gap-0 overflow-x-auto scrollbar-hide divide-x divide-[#f3f4f6]">
          {displayIndices.map((idx) => {
            const positive = idx.changePct >= 0;
            return (
              <div key={idx.ticker} className="flex flex-col gap-0.5 px-6 shrink-0 text-center">
                <span className="text-[11px] font-semibold text-[#9ca3af] tracking-[0.06em] uppercase whitespace-nowrap">
                  {idx.name.length > 14 ? idx.ticker : idx.name}
                </span>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-[15px] font-semibold tabular-nums text-[#111111]">
                    {fmtPrice(idx.price)}
                  </span>
                  <span
                    className="text-[12px] font-semibold tabular-nums"
                    style={{ color: positive ? "#10b981" : "#ef4444" }}
                  >
                    {fmtPct(idx.changePct)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
