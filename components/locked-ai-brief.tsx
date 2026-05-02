"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

type Props = {
  ticker: string;
  isSubscribed: boolean;
};

// A blurred mock of the AI brief layout: Strategic Directive, News signal,
// Catalysts/Drivers/Risks, Sentiment. Sits behind the unlock CTA so free
// users see exactly what they get on the AI tier.
export function LockedAiBrief({ ticker, isSubscribed }: Props) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  const cta = !user
    ? {
        title: `Unlock the AI brief for ${ticker}`,
        body: "Sign in to unlock the free AI tier — news-backed briefs on 15 US + 15 IN launch stocks, refreshed twice daily.",
        label: "Sign in with Google",
        onClick: async () => {
          try {
            const auth = getFirebaseAuth();
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            await signInWithPopup(auth, provider);
            router.refresh();
          } catch {
            setError("Sign-in cancelled or failed.");
          }
        },
      }
    : !isSubscribed
      ? {
          title: `${ticker} isn't on the free AI tier`,
          body: "Subscribe to add this stock to your personal AI tier — we'll fetch its news, enrich it, and run a dedicated brief on every refresh.",
          label: "Subscribe to unlock",
          onClick: () => router.push("/subscribe"),
        }
      : {
          title: `Track ${ticker} to unlock its AI brief`,
          body: "Tracking adds this stock to your personal AI tier. The next twice-daily refresh will include its news-backed brief.",
          label: pending ? "Tracking…" : "Track this stock",
          onClick: () => {
            startTransition(async () => {
              setError(null);
              const res = await fetch("/api/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker }),
              });
              if (!res.ok) {
                setError("Could not track — try again.");
                return;
              }
              router.refresh();
            });
          },
        };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none select-none flex flex-col gap-8"
        style={{ filter: "blur(6px)", opacity: 0.55 }}
      >
        <MockDirective ticker={ticker} />
        <MockNewsSignal />
        <MockCatalystsRow />
        <MockSentiment />
      </div>

      <div className="absolute inset-0 flex items-start justify-center pt-16 md:pt-24">
        <div className="w-full max-w-[460px] rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_8px_32px_rgba(17,17,17,0.08)] p-6 flex flex-col gap-3">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
            <span aria-hidden>🔒</span> AI tier
          </span>
          <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            {cta.title}
          </h3>
          <p className="text-[13px] text-[#6b7280] leading-relaxed">{cta.body}</p>
          <button
            type="button"
            onClick={() => cta.onClick()}
            className="mt-1 inline-flex items-center justify-center h-[40px] rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            {cta.label}
          </button>
          {error && (
            <p className="text-[12px] font-medium text-[#ef4444]">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MockDirective({ ticker }: { ticker: string }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[16px]">
          🎯
        </span>
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
          Strategic directive
        </span>
      </div>
      <p className="text-[15px] font-semibold text-[#111111] leading-snug">
        Accumulate {ticker} into the next earnings print — recent guide-up has
        not yet been priced into the multiple.
      </p>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-semibold text-[#065f46]">
          Accumulate
        </span>
        <span className="text-[12px] text-[#6b7280]">High confidence</span>
      </div>
    </section>
  );
}

function MockNewsSignal() {
  const tiles = [
    { emoji: "📰", title: "What changed", body: "Margin guide came in 220bps above sell-side consensus on stronger pricing." },
    { emoji: "🎯", title: "Why it matters", body: "Sets up multiple expansion if Q4 print confirms the durability of the new tier." },
    { emoji: "🔭", title: "What to watch", body: "Channel checks ahead of Apr 29 print and any signal on FY26 backlog growth." },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-[#111111]">News signal</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div
            key={t.title}
            className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-2"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f6] text-[16px]">
              {t.emoji}
            </span>
            <span className="text-[12px] font-semibold tracking-[0.04em] uppercase text-[#6b7280]">
              {t.title}
            </span>
            <p className="text-[13px] text-[#111111] leading-snug">{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockCatalystsRow() {
  const sections = [
    {
      emoji: "⚡",
      label: "Catalysts",
      tone: "#0052ff",
      cards: [
        { title: "Earnings — Apr 29 AMC", detail: "Street looking for +18% EPS." },
        { title: "Investor day — May 14", detail: "Multi-year capacity update." },
      ],
    },
    {
      emoji: "📈",
      label: "Drivers",
      tone: "#10b981",
      cards: [
        { title: "AI infra demand", detail: "Hyperscaler capex still inflecting." },
        { title: "Mix shift", detail: "Higher-margin tier now 38% of revenue." },
      ],
    },
    {
      emoji: "⚠️",
      label: "Risks",
      tone: "#ef4444",
      cards: [
        { title: "Concentration", detail: "Top customer = 22% of bookings." },
        { title: "Inventory", detail: "Channel weeks-on-hand at 3yr high." },
      ],
    },
  ];
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-[16px] font-semibold text-[#111111]">
        Catalysts · Drivers · Risks
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((s) => (
          <div key={s.label} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">{s.emoji}</span>
              <span
                className="text-[12px] font-semibold tracking-[0.06em] uppercase"
                style={{ color: s.tone }}
              >
                {s.label}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {s.cards.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl border border-[#e5e7eb] bg-white p-3"
                >
                  <p className="text-[13px] font-semibold text-[#111111]">
                    {c.title}
                  </p>
                  <p className="text-[12px] text-[#6b7280] mt-0.5">{c.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockSentiment() {
  const lanes = [
    { label: "Tier-1 newswires", pct: 72 },
    { label: "Sell-side notes", pct: 64 },
    { label: "Retail / X", pct: 51 },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-[#111111]">Sentiment lanes</h3>
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3">
        {lanes.map((l) => (
          <div key={l.label} className="flex items-center gap-4">
            <span className="text-[12px] font-medium text-[#6b7280] w-44 shrink-0">
              {l.label}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${l.pct}%` }}
              />
            </div>
            <span className="text-[12px] font-semibold text-[#111111] tabular-nums w-10 text-right">
              {l.pct}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
