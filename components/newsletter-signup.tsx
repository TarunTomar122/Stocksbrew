"use client";

import { useState } from "react";

const OUTCOMES = [
  { label: "Start Monday informed", body: "You open your week already knowing what happened and why — no catching up." },
  { label: "Stop missing the story", body: "When a stock moves 20%, you find out what actually caused it, not just the number." },
  { label: "Know what to watch", body: "Each issue ends with the 3 things worth paying attention to in the coming week." },
];

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setState("loading");
    try {
      const res = await fetch("/api/newsletter-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "homepage" }),
      });
      setState(res.ok ? "success" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="rounded-3xl border border-[#e5e7eb] bg-white overflow-hidden">
      <div className="px-8 md:px-14 py-12 md:py-14 flex flex-col md:flex-row gap-12 md:gap-16">

        {/* Left copy */}
        <div className="flex flex-col gap-6 flex-1 min-w-0">
          <div className="flex flex-col gap-3">
            <span className="inline-flex items-center gap-1.5 w-fit rounded-full bg-[#d1fae5] px-2.5 py-1 text-[11px] font-semibold text-[#065f46] tracking-[0.04em]">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              </span>
              Free every week
            </span>
            <h2 className="text-[26px] md:text-[32px] font-semibold text-[#111111] tracking-[-0.025em] leading-[1.2]">
              The week in markets,<br className="hidden md:block" /> in plain English
            </h2>
            <p className="text-[15px] text-[#6b7280] leading-relaxed max-w-sm">
              One email every week. You read it in 3 minutes and actually understand what happened in the market.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {OUTCOMES.map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d1fae5]">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.2 2.2L8 3" stroke="#10b981" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-[#111111]">{item.label}</span>
                  <span className="text-[13px] text-[#6b7280] leading-snug">{item.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Right form */}
        <div className="flex flex-col justify-center w-full md:w-[320px] shrink-0">
          {state === "success" ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-6 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d1fae5]">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9l4.5 4.5L15 5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[#111111]">You&apos;re on the list.</p>
              <p className="text-[13px] text-[#6b7280]">First issue lands in your inbox this week.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:border-[#111111] focus:bg-white transition-colors"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="h-11 rounded-xl bg-[#111111] px-6 text-[14px] font-semibold text-white hover:bg-black disabled:opacity-60 transition-colors"
              >
                {state === "loading" ? "Subscribing..." : "Get the weekly brief"}
              </button>
              {state === "error" && (
                <p className="text-[12px] text-[#ef4444]">Something went wrong. Try again.</p>
              )}
              <p className="text-[11px] text-[#9ca3af] text-center">No spam. Unsubscribe any time.</p>
            </form>
          )}
        </div>

      </div>
    </section>
  );
}
