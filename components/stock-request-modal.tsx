"use client";

import { useEffect, useState } from "react";

type Props = {
  query: string;
  onClose: () => void;
};

export function StockRequestModal({ query, onClose }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // Auto-submit on mount
  useEffect(() => {
    setStatus("loading");
    fetch("/api/stock-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => (r.ok ? setStatus("done") : setStatus("error")))
      .catch(() => setStatus("error"));
  }, [query]);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[#111111]/40 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="relative w-full max-w-[380px] rounded-3xl bg-white p-7 shadow-[0_24px_70px_rgba(17,24,39,0.18)] flex flex-col gap-5">
        {/* Icon */}
        <div className="flex items-center justify-center">
          {status === "done" ? (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#ecfdf5]">
              <span
                className="material-symbols-outlined text-[#10b981]"
                style={{ fontSize: 28, fontVariationSettings: "'wght' 600" }}
              >
                check_circle
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

        {/* Text */}
        <div className="flex flex-col gap-1.5 text-center">
          {status === "done" && (
            <>
              <p className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
                Request sent for{" "}
                <span className="font-bold">{query}</span>
              </p>
              <p className="text-[14px] text-[#6b7280] leading-relaxed">
                We queued this request. We’ll email you as soon as this stock is available in Tikrr.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <p className="text-[18px] font-semibold text-[#111111]">Something went wrong</p>
              <p className="text-[14px] text-[#6b7280]">Couldn't save your request. Please try again.</p>
            </>
          )}
          {status === "loading" && (
            <p className="text-[15px] text-[#6b7280]">Sending request…</p>
          )}
        </div>

        {/* CTA */}
        {status !== "loading" && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center h-11 rounded-full bg-[#111111] text-white text-[14px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform"
          >
            {status === "done" ? "Got it!" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}
