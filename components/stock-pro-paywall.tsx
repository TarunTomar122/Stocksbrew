"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import {
  type PaywallSurface,
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";
import type { StockIntelPro } from "@/lib/types";

const BENEFITS = [
  "Daily directive: buy, hold, sell, or watch",
  "Big news and headlines tied to the call",
  "Catalysts, earnings, and risks flagged",
  "Sentiment from news, analysts, and the crowd",
];

const UNLOCK_ROWS = [
  {
    label: "Strategic directive",
    detail: "One clear stance on the name",
  },
  {
    label: "News read",
    detail: "What changed and why it matters",
  },
  {
    label: "AI brief",
    detail: "Catalysts, drivers, risks, sentiment",
  },
];

function ProUnlockSketch({ ticker }: { ticker: string }) {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
          What Pro unlocks on {ticker}
        </p>
        <p className="text-[12px] text-[#9ca3af]">Illustration only. Not today&apos;s call.</p>
      </div>

      <div className="flex flex-col gap-3">
        {UNLOCK_ROWS.map((row) => (
          <div
            key={row.label}
            className="flex items-start gap-3 border-b border-dashed border-[#e5e7eb] pb-3 last:border-b-0 last:pb-0"
          >
            <span
              aria-hidden
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f3f4f6] text-[14px] text-[#9ca3af]"
            >
              🔒
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-[#111111]">{row.label}</span>
              <span className="text-[12px] text-[#6b7280]">{row.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {["Accumulate", "Hold", "Watch", "Trim"].map((stance) => (
          <span
            key={stance}
            className="rounded-md bg-[#f3f4f6] px-2 py-1 text-[11px] font-semibold text-[#9ca3af]"
          >
            {stance}
          </span>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-[#9ca3af]">
        Pro picks one live stance each morning after reading the news. This is not a recommendation
        on {ticker}.
      </p>
    </div>
  );
}

export function StockProPaywall({
  ticker,
  intel: _intel,
  surface = "stock_pro",
}: {
  ticker: string;
  intel?: StockIntelPro | null;
  surface?: PaywallSurface;
}) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackPaywallShown({
      surface,
      ticker,
      signedIn: Boolean(user),
    });
  }, [surface, ticker, user]);

  async function handleUnlock() {
    trackPaywallUnlockClicked({
      surface,
      ticker,
      signedIn: Boolean(user),
    });
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle({ surface: "paywall" });
        router.push("/subscribe");
      } catch (err) {
        console.error("sign-in failed", err);
      } finally {
        setBusy(false);
      }
      return;
    }
    router.push("/subscribe");
  }

  return (
    <section className="flex flex-col gap-8 pt-8 lg:flex-row lg:items-start lg:justify-between lg:gap-14">
      <div className="flex max-w-[460px] flex-col gap-5">
        <div className="flex flex-col gap-2.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#92400e]">
            <span aria-hidden>★</span> stocksbrew Pro
          </span>
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[#111111] md:text-[26px]">
            Know when to buy, hold, or sell {ticker}
          </h2>
          <p className="text-[14px] leading-relaxed text-[#6b7280]">
            Scores are above. Pro reads the news on {ticker}, flags the catalyst, and gives you one
            daily call plus the full AI brief.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-[14px] text-[#374151]">
              <span aria-hidden className="text-[#10b981]">
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:max-w-[280px]">
          <button
            type="button"
            disabled={busy}
            onClick={handleUnlock}
            className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#111111] px-6 py-3 text-[14px] font-semibold text-white transition-transform hover:-translate-y-[1px] active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Signing you in…" : user ? "Start 3 days free" : "Sign in and start free"}
            {!busy && <span aria-hidden>→</span>}
          </button>
          <span className="text-[11px] text-[#9ca3af]">3 days free, then $12/mo. Cancel anytime.</span>
        </div>
      </div>

      <div className="w-full max-w-[400px] lg:pt-1">
        <ProUnlockSketch ticker={ticker} />
      </div>
    </section>
  );
}
