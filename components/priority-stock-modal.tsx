"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  instrumentId: string;
  ticker: string;
};

export function PriorityStockModal({ open, instrumentId, ticker }: Props) {
  const [visible, setVisible] = useState(false);
  const storageKey = useMemo(
    () => `tikrr_priority_stock_seen:${instrumentId}`,
    [instrumentId],
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
      // Session storage may be unavailable; show modal this visit.
    }
    setVisible(true);
  }, [open, storageKey]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-[560px] rounded-3xl border border-[#e5e7eb] bg-white p-6 md:p-7 shadow-[0_30px_90px_rgba(17,24,39,0.28)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#1d4ed8]">
              <span aria-hidden>ℹ️</span>
              Refresh notice
            </span>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight">
              {ticker} is currently outside the high-frequency 100.
            </h2>
            <p className="text-[14px] text-[#6b7280] leading-relaxed">
              This page still works, but intraday refresh is less frequent right
              now. We use real user demand (visits and Watchlist interest) to
              promote stocks into the high-frequency set.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f8f9fa]"
            aria-label="Close priority refresh notice"
          >
            <AnimatedIcon name="close" size={18} className="text-[18px]" />
          </button>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="inline-flex h-[40px] items-center justify-center rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
