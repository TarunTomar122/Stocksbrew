"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { StockLogo } from "@/components/stock-logo";
import { useUser } from "@/lib/auth-context";
import { US_PRO_MONTHLY_MO } from "@/lib/pricing";
import { trackPaywallUnlockClicked } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";

type Props = {
  stock: {
    ticker: string;
    name: string;
    price: number;
    day_change_pct?: number;
    exchange?: string;
  };
  currency: string;
  market: "US" | "IN";
};

export function StockTrialGate({ stock, currency, market }: Props) {
  const { user } = useUser();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const move = stock.day_change_pct ?? 0;
  const hasTrial = market === "US";

  async function startTrial() {
    setError(null);
    trackPaywallUnlockClicked({
      surface: "locked_verdict_call",
      ticker: stock.ticker,
      signedIn: Boolean(user),
    });
    if (!user) {
      setBusy(true);
      try {
        await signInWithGoogle({ surface: "locked_verdict_call" });
      } catch {
        setError("Sign-in cancelled or failed.");
        setBusy(false);
        return;
      }
    }
    router.push("/subscribe");
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-[1040px] flex-col px-4 py-8 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-outline-variant pb-5">
        <StockLogo ticker={stock.ticker} market={market} size={46} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight text-on-surface sm:text-2xl">
            {stock.name}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-on-surface-variant">
            {[stock.ticker, stock.exchange].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xl font-extrabold tabular-nums text-on-surface sm:text-2xl">
            {currency}
            {stock.price.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p
            className="mt-0.5 font-mono text-[11px] font-bold tabular-nums"
            style={{ color: move >= 0 ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
          >
            {move >= 0 ? "▲" : "▼"} {Math.abs(move).toFixed(2)}% today
          </p>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-20">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-landing-brand">
          stocksbrew Pro
        </p>
        <h2 className="mt-3 max-w-2xl text-3xl font-extrabold leading-[1.08] tracking-[-0.04em] text-on-surface sm:text-5xl">
          See the full {stock.ticker} research page.
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-on-surface-variant sm:text-base">
          Unlock our current call, price zones, target, fundamentals, news, crowd signals, and Radar alerts.
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={() => void startTrial()}
          className="mt-8 inline-flex min-h-14 w-full max-w-sm items-center justify-center rounded-xl bg-on-surface px-6 py-3.5 font-mono text-[13px] font-bold leading-none text-surface transition-opacity hover:opacity-85 disabled:opacity-60 sm:min-h-[52px] sm:py-3"
        >
          {busy
            ? "Signing you in…"
            : hasTrial
              ? "Start your 3-day free trial"
              : "Unlock Stocksbrew Pro"}
        </button>
        <p className="mt-3 text-[11px] text-on-surface-variant">
          {hasTrial ? `Free for 3 days, then ${US_PRO_MONTHLY_MO}. Cancel anytime.` : "Cancel anytime."}
        </p>
        {error ? <p className="mt-3 text-[12px] font-medium text-[#ef4444]">{error}</p> : null}
      </section>
    </main>
  );
}
