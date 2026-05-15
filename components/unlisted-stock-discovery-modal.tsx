"use client";

import { useEffect, useState } from "react";

type Props = {
  ticker: string;
  onDismiss: () => void;
};

export function UnlistedStockDiscoveryModal({ ticker, onDismiss }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    setStatus("loading");
    fetch("/api/stock-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ticker }),
    })
      .then((r) => (r.ok ? setStatus("done") : setStatus("error")))
      .catch(() => setStatus("error"));
  }, [ticker]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0 bg-[#111111]/40 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-[400px] rounded-3xl bg-white p-7 shadow-[0_24px_70px_rgba(17,24,39,0.18)] flex flex-col gap-5">
        <div className="flex items-center justify-center">
          {status === "done" ? (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#eff6ff]">
              <span
                className="material-symbols-outlined text-[#0052ff]"
                style={{ fontSize: 28, fontVariationSettings: "'wght' 600" }}
              >
                radar
              </span>
            </span>
          ) : status === "error" ? (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#fef2f2]">
              <span
                className="material-symbols-outlined text-[#ef4444]"
                style={{ fontSize: 28, fontVariationSettings: "'wght' 600" }}
              >
                error
              </span>
            </span>
          ) : (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
              <span
                className="material-symbols-outlined text-[#6b7280] animate-spin"
                style={{ fontSize: 28 }}
              >
                progress_activity
              </span>
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 text-center">
          <p className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em] leading-snug">
            <span className="font-bold">{ticker}</span> isn&apos;t in our library yet
          </p>
          <p className="text-[14px] text-[#6b7280] leading-relaxed">
            We haven&apos;t been tracking this name with full price and AI coverage. Because you opened this page,
            we&apos;re queueing it now —{" "}
            <span className="font-semibold text-[#111111]">we&apos;ll start today</span>.
          </p>
          {status === "error" && (
            <p className="text-[12px] text-[#b91c1c]">
              Couldn&apos;t save the queue signal. You can still read any Reddit context we have below.
            </p>
          )}
          {status === "loading" && (
            <p className="text-[12px] text-[#9ca3af]">Saving your visit…</p>
          )}
        </div>

        {status !== "loading" ? (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex w-full items-center justify-center h-11 rounded-full bg-[#111111] text-white text-[14px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            Got it
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex w-full items-center justify-center h-11 rounded-full border border-[#e5e7eb] bg-white text-[#111111] text-[14px] font-semibold tracking-tight hover:bg-[#f9fafb]"
          >
            Continue to page
          </button>
        )}
      </div>
    </div>
  );
}
