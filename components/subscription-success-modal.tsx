"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { posthog } from "@/lib/posthog";

type Props = {
  open: boolean;
  subscriptionId?: string;
};

export function SubscriptionSuccessModal({ open, subscriptionId }: Props) {
  const [visible, setVisible] = useState(false);
  const storageKey = useMemo(
    () => `tikrr_subscribe_success_seen:${subscriptionId ?? "latest"}`,
    [subscriptionId],
  );

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    try {
      if (sessionStorage.getItem(storageKey) === "1") {
        setVisible(false);
        return;
      }
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Session storage may be unavailable; still show the modal once.
    }
    posthog.capture("subscription_converted", {
      subscription_id: subscriptionId ?? null,
    });
    setVisible(true);
  }, [open, storageKey]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-[620px] rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7 shadow-[0_30px_90px_rgba(17,24,39,0.30)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#047857]">
              <span aria-hidden>🎉</span>
              Pro active
            </span>
            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight">
              You&apos;re in. Radar is now unlocked.
            </h2>
            <p className="text-[14px] text-[#6b7280] leading-relaxed">
              Track any stock and we&apos;ll spin up AI coverage immediately for first-pass context.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f8f9fa]"
            aria-label="Close success modal"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 text-[13px] text-[#374151]">
          <p className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
            <span className="font-semibold text-[#111111]">1. Add any stock to Radar.</span> Use the add
            button on stock pages or from Radar.
          </p>
          <p className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
            <span className="font-semibold text-[#111111]">2. AI spins up instantly.</span> We queue news +
            synthesis right away and generate the first brief.
          </p>
          <p className="rounded-xl bg-[#f8fafc] px-3 py-2.5">
            <span className="font-semibold text-[#111111]">3. You get ongoing updates.</span> Briefs refresh
            on every run with changes, catalysts, and risks.
          </p>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/"
            className="inline-flex h-[42px] items-center justify-center rounded-full border border-[#111111] px-5 text-[13px] font-semibold text-[#111111]"
          >
            Browse stocks
          </Link>
          <Link
            href="/watchlist"
            className="inline-flex h-[42px] items-center justify-center rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white"
          >
            Go to Radar →
          </Link>
        </div>
      </div>
    </div>
  );
}
