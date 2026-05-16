"use client";

import { useEffect, useState } from "react";

import { useUser } from "@/lib/auth-context";

const STORAGE_KEY = "tikrr_newsletter_modal_dismissed";
const DELAY_MS = 4000;

export function NewsletterModal() {
  const { user, initialAuthed } = useUser();
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (user || initialAuthed) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      // localStorage unavailable
    }
    const t = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [user, initialAuthed]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setState("loading");
    try {
      const res = await fetch("/api/newsletter-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "homepage_modal" }),
      });
      if (res.ok) {
        setState("success");
        setTimeout(dismiss, 2500);
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-[400px] rounded-3xl bg-white shadow-[0_32px_80px_rgba(0,0,0,0.25)] overflow-hidden">

        {/* Close button */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb] transition-colors"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Content */}
        <div className="px-7 pt-6 pb-7 flex flex-col gap-5">

          {state === "success" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#d1fae5]">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M4 11l5.5 5.5L18 6" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-[17px] font-semibold text-[#111111]">You&apos;re on the list.</p>
                <p className="text-[13px] text-[#6b7280]">First issue lands in your inbox this week.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d1fae5] px-2.5 py-1 text-[11px] font-semibold text-[#065f46] tracking-[0.04em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                    Free every week
                  </span>
                </div>
                <h2 className="text-[22px] font-semibold text-[#111111] tracking-[-0.02em] leading-[1.25]">
                  The week in markets,<br />in plain English
                </h2>
                <p className="text-[13px] text-[#6b7280] leading-relaxed">
                  What moved, what mattered, and what to watch next - delivered free every week.
                </p>
              </div>

              {/* Bullets */}
              <ul className="flex flex-col gap-2 border-t border-[#f3f4f6] pt-4">
                {[
                  "Biggest movers and the story behind them",
                  "Macro shifts that actually affect your stocks",
                  "What to watch in the week ahead",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px] text-[#374151]">
                    <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="7" fill="#d1fae5"/>
                      <path d="M4 7l2.2 2.2L10 5" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#10b981] focus:bg-white transition-colors"
                />
                <button
                  type="submit"
                  disabled={state === "loading"}
                  className="h-11 rounded-xl bg-[#111111] px-6 text-[14px] font-semibold text-white hover:bg-[#000] disabled:opacity-60 transition-colors"
                >
                  {state === "loading" ? "Subscribing…" : "Get the weekly brief →"}
                </button>
                {state === "error" && (
                  <p className="text-[12px] text-[#ef4444]">Something went wrong. Try again.</p>
                )}
                <p className="text-[11px] text-[#9ca3af] text-center">No spam. Unsubscribe any time.</p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
