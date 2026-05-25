"use client";

import { useState } from "react";
import { captureEvent } from "@/lib/posthog";

const OUTCOMES = [
  { label: "What moved overnight and why" },
  { label: "3 things worth watching before close" },
];

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setState("loading");
    captureEvent("newsletter_signup_submitted", { source: "homepage" });
    try {
      const res = await fetch("/api/newsletter-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "homepage" }),
      });
      setState(res.ok ? "success" : "error");
      captureEvent(res.ok ? "newsletter_signup_succeeded" : "newsletter_signup_failed", {
        source: "homepage",
        status: res.status,
      });
    } catch {
      setState("error");
      captureEvent("newsletter_signup_failed", { source: "homepage", error: "network" });
    }
  }

  return (
    <section className="rounded-3xl border border-[#e5e7eb] bg-white overflow-hidden">
      <div className="px-5 sm:px-8 md:px-14 py-10 md:py-16 flex flex-col items-center gap-6 text-center">

        {/* Copy */}
        <div className="flex flex-col items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d1fae5] px-2.5 py-1 text-[11px] font-semibold text-[#065f46] tracking-[0.04em]">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            </span>
            Free every weekday
          </span>
          <h2 className="text-[26px] md:text-[32px] font-semibold text-[#111111] tracking-[-0.025em] leading-[1.2]">
            The market today, in plain English.
          </h2>
          <p className="text-[14px] text-[#6b7280]">3 minutes every morning. Free.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5">
            {OUTCOMES.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5 text-[12px] text-[#6b7280]">
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="shrink-0">
                  <path d="M2 5l2.2 2.2L8 3" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="w-full max-w-[400px]">
          {state === "success" ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] px-6 py-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#d1fae5]">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9l4.5 4.5L15 5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[15px] font-semibold text-[#111111]">You&apos;re on the list.</p>
              <p className="text-[13px] text-[#6b7280]">Your first daily brief lands tomorrow morning.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 text-[14px] text-[#111111] placeholder:text-[#9ca3af] outline-none focus:outline-none focus:ring-0 focus:border-[#111111] focus:bg-white transition-colors"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="h-11 rounded-xl bg-[#111111] px-6 text-[14px] font-semibold text-white hover:bg-black disabled:opacity-60 transition-colors"
              >
                {state === "loading" ? "Subscribing..." : "Get the daily brief"}
              </button>
              {state === "error" && (
                <p className="text-[12px] text-[#ef4444]">Something went wrong. Try again.</p>
              )}
              <p className="text-[11px] text-[#9ca3af]">No spam. Unsubscribe any time.</p>
            </form>
          )}
        </div>

      </div>
    </section>
  );
}
