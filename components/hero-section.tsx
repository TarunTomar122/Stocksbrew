"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";

type IndexData = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type Props = {
  score: number;
  tone: string;
  color: string;
  indices: IndexData[];
  featuredStock?: { ticker: string; name: string; price: number; changePct: number };
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

export function HeroSection({ score, tone, color, indices, isSubscribed = false }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const moodLabel =
    score < 25 ? "Very Cautious" :
    score < 45 ? "Cautious" :
    score < 55 ? "Balanced" :
    score < 75 ? "Confident" : "Overheated";

  async function startFreeRadar() {
    if (user) {
      router.push("/watchlist");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      await syncServerSession().catch(() => undefined);
      router.push("/onboarding");
    } catch (err) {
      console.error("sign-in failed", err);
      setBusy(false);
    }
  }

  function scrollToMovers() {
    const el = document.getElementById("market-movers");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
    }
  }

  const displayIndices = indices.slice(0, 5);

  return (
    <section className="w-full overflow-hidden">
      {/* Main content — centered */}
      <div className="flex flex-col items-center text-center gap-6 pt-10 md:pt-14 pb-8 md:pb-10">

        {/* Mood pill */}
        <span className="inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-3 py-1.5 text-[12px] font-medium text-[#374151]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
          Today&apos;s market mood: {moodLabel} · {Math.round(score)}
        </span>

        {/* Headline */}
        <div className="flex flex-col items-center gap-4 max-w-3xl">
          <h1 className="text-[40px] md:text-[56px] lg:text-[64px] font-semibold text-[#111111] tracking-[-0.04em] leading-[1.05]">
            Your daily market brief<br />in 5 seconds.
          </h1>
          <p className="text-[16px] md:text-[18px] text-[#6b7280] leading-[1.55] max-w-[480px]">
            Tikrr tracks every unusual stock move and explains it in plain English, every day, free.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={startFreeRadar}
            disabled={busy}
            className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-[#111111] text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
          >
            {busy ? "Opening Radar..." : user ? "Check your Radar" : "Start free Radar"}
          </button>
          <button
            type="button"
            onClick={scrollToMovers}
            className="inline-flex items-center gap-1.5 justify-center h-11 px-5 rounded-full border border-[#e5e7eb] text-[#374151] text-[14px] font-medium hover:border-[#d1d5db] hover:bg-[#f9fafb] transition-colors"
          >
            See today&apos;s movers
            <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 500" }}>arrow_downward</span>
          </button>
        </div>

        {/* Proof points */}
        {!isSubscribed && (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            {["Free Radar for your first watchlist", "No credit card to start", "Pro is $9/mo when you want alerts"].map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 text-[12px] text-[#9ca3af]">
                <span className="h-1 w-1 rounded-full bg-[#d1d5db]" />
                {p}
              </span>
            ))}
          </div>
        )}
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
