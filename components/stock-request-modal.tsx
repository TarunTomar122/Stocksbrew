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
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  // Auto-submit on mount
  useEffect(() => {
    setStatus("loading");
    fetch("/api/stock-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => {
        if (r.ok) {
          setStatus("done");
          r.json().then((data) => setEmailSaved(Boolean(data.emailAttached))).catch(() => {});
        } else setStatus("error");
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

  async function saveEmail() {
    setEmailSaving(true);
    const response = await fetch("/api/stock-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, email }),
    }).catch(() => null);
    setEmailSaving(false);
    if (response?.ok) setEmailSaved(true);
  }

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
                We queued this request. Add an email if you want a note when the research is ready.
              </p>
              {!emailSaved && (
                <form onSubmit={(event) => { event.preventDefault(); void saveEmail(); }} className="mt-3 flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    aria-label="Email for stock request updates"
                    className="min-w-0 flex-1 rounded-full border border-[#d1d5db] px-4 text-[13px] outline-none focus:border-[#111111]"
                  />
                  <button type="submit" disabled={emailSaving} className="rounded-full bg-[#111111] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
                    {emailSaving ? "Saving" : "Email me"}
                  </button>
                </form>
              )}
              {emailSaved && <p className="text-[12px] font-medium text-[#047857]">We’ll email you when it’s ready.</p>}
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
