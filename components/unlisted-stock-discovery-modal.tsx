"use client";

import { AnimatedIcon } from "@/components/animated-icon";
import { useEffect, useState } from "react";

type Props = {
  ticker: string;
  onDismiss: () => void;
};

export function UnlistedStockDiscoveryModal({ ticker, onDismiss }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    setStatus("loading");
    fetch("/api/stock-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ticker }),
    })
      .then(async (r) => {
        if (!r.ok) return setStatus("error");
        setStatus("done");
        const data = await r.json().catch(() => ({}));
        setEmailSaved(Boolean(data.emailAttached));
      })
      .catch(() => setStatus("error"));
  }, [ticker]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  async function saveEmail() {
    setEmailSaving(true);
    const response = await fetch("/api/stock-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: ticker, email }),
    }).catch(() => null);
    setEmailSaving(false);
    if (response?.ok) setEmailSaved(true);
  }

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
              <AnimatedIcon name="radar" size={28} className="text-[#0052ff]" aria-hidden />
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

        <div className="flex flex-col gap-2 text-center">
          <p className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em] leading-snug">
            <span className="font-bold">{ticker}</span> isn&apos;t in our library yet
          </p>
          <p className="text-[14px] text-[#6b7280] leading-relaxed">
            We haven&apos;t been tracking this name with full price and AI coverage. Because you opened this page,
            we&apos;ve queued it for research.
          </p>
          {status === "done" && !emailSaved && (
            <form onSubmit={(event) => { event.preventDefault(); void saveEmail(); }} className="mt-2 flex gap-2">
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
