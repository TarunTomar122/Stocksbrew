"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { ProCtaButton } from "@/components/pro-cta";
import {
  type PaywallSurface,
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";
import type { StockIntelPro } from "@/lib/types";

const BENEFITS = [
  "A current add, hold, trim, or watch view",
  "The news connected to the company",
  "Earnings, catalysts, and risks in one brief",
  "Analyst and investor context",
];

const UNLOCK_ROWS = [
  {
    label: "Current view",
    detail: "What the research supports today",
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
          What Pro unlocks on {ticker}
        </p>
        <p className="text-[12px] text-on-surface-variant">Illustration only. Not today&apos;s call.</p>
      </div>

      <div className="flex flex-col gap-3">
        {UNLOCK_ROWS.map((row) => (
          <div
            key={row.label}
            className="flex items-start gap-3 border-b border-dashed border-outline-variant pb-3 last:border-b-0 last:pb-0"
          >
            <span
              aria-hidden
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-container text-[14px] text-on-surface-variant"
            >
              🔒
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-on-surface">{row.label}</span>
              <span className="text-[12px] text-on-surface-variant">{row.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {["Accumulate", "Hold", "Watch", "Trim"].map((stance) => (
          <span
            key={stance}
            className="rounded-md bg-surface-container px-2 py-1 text-[11px] font-semibold text-on-surface-variant"
          >
            {stance}
          </span>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-on-surface-variant">
        The live page uses current evidence. This sketch is not a recommendation on {ticker}.
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
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full tint-warn px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase text-[#f59e0b]">
            <span aria-hidden>★</span> stocksbrew Pro
          </span>
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-on-surface md:text-[26px]">
            Know when to buy, hold, or sell {ticker}
          </h2>
          <p className="text-[14px] leading-relaxed text-on-surface-variant">
            Pro connects {ticker}&apos;s financials, news, catalysts and risks in one current brief.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-[14px] text-on-surface">
              <span aria-hidden className="text-[#10b981]">
                ✓
              </span>
              {benefit}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 sm:max-w-[280px]">
          <ProCtaButton type="button" disabled={busy} onClick={handleUnlock} fullWidth showStar>
            {busy ? "Signing you in…" : user ? "Choose Pro" : "Start your 3-day free trial"}
            {!busy && <span aria-hidden>→</span>}
          </ProCtaButton>
          <span className="text-[11px] text-on-surface-variant">
            3 days free, then $9/month. Cancel anytime.
          </span>
        </div>
      </div>

      <div className="w-full max-w-[400px] lg:pt-1">
        <ProUnlockSketch ticker={ticker} />
      </div>
    </section>
  );
}
