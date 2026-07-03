"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import { useEffect, useState } from "react";
import { captureEvent } from "@/lib/posthog";

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
      .then((r) => {
        setStatus(r.ok ? "done" : "error");
        captureEvent(r.ok ? "stock_request_succeeded" : "stock_request_failed", {
          query,
          status: r.status,
        });
      })
      .catch(() => {
        setStatus("error");
        captureEvent("stock_request_failed", { query, error: "network" });
      });
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
              <AnimatedIcon name="check_circle" size={28} className="text-[#10b981]" aria-hidden />
            </span>
          ) : status === "error" ? (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#fef2f2]">
              <AnimatedIcon name="error" size={28} className="text-[#ef4444]" aria-hidden />
            </span>
          ) : (
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
              <AnimatedIcon name="progress_activity" size={28} className="text-[#6b7280] animate-spin" aria-hidden />
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
                We queued this request. We’ll email you as soon as this stock is available in stocksbrew.
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
