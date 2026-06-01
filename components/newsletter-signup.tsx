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
    <section className="w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-card overflow-hidden">
      <div className="px-5 sm:px-8 md:px-11 py-9 md:py-12 flex flex-col items-center gap-8 md:gap-10 text-center">

        {/* Copy */}
        <div className="flex flex-col items-center gap-4 max-w-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/35 bg-surface-container-low px-2.5 py-1 text-[11px] font-semibold tracking-[0.04em] text-on-surface-variant">
            <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-signal-bullish opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-bullish" />
            </span>
            Free every weekday
          </span>
          <div className="flex flex-col gap-2 md:gap-2.5">
            <h2 className="font-headline text-[1.625rem] sm:text-[1.75rem] md:text-[2rem] font-semibold text-on-surface tracking-[-0.025em] leading-[1.15]">
              The market today, in plain English.
            </h2>
            <p className="text-sm md:text-[15px] leading-relaxed text-on-surface-variant">
              3 minutes every morning. Free.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-2 sm:gap-x-8 sm:gap-y-2">
            {OUTCOMES.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5 text-[13px] text-on-surface-variant">
                <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="shrink-0 text-signal-bullish" aria-hidden>
                  <path d="M2 5l2.2 2.2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Form / confirmation */}
        <div className="w-full max-w-xl border-t border-outline-variant/20 pt-8 md:pt-9 flex flex-col items-stretch">
          {state === "success" ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-outline-variant/30 bg-surface px-6 py-8 md:px-8 md:py-9 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-low border border-outline-variant/25">
                <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="text-signal-bullish shrink-0" aria-hidden>
                  <path d="M3 9l4.5 4.5L15 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[15px] md:text-[16px] font-semibold text-on-surface tracking-tight">You&apos;re on the list.</p>
                <p className="text-[13px] md:text-[14px] leading-relaxed text-on-surface-variant">
                  Your first daily brief lands tomorrow morning.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 text-left sm:text-center items-stretch">
              <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-3 sm:justify-center">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="box-border min-h-[52px] h-[52px] sm:min-h-0 sm:h-11 w-full min-w-0 flex-1 rounded-xl border border-outline-variant/35 bg-surface px-4 text-[16px] sm:text-[14px] leading-normal text-on-surface placeholder:text-on-surface-variant/50 outline-none ring-0 focus:outline-none focus:ring-0 focus:border-on-surface/35 focus:bg-surface disabled:opacity-60 transition-colors"
                />
                <button
                  type="submit"
                  disabled={state === "loading"}
                  className="min-h-[52px] h-[52px] sm:min-h-[44px] sm:h-auto w-full shrink-0 rounded-xl bg-inverse-surface px-6 text-[14px] font-semibold text-inverse-on-surface hover:opacity-[0.92] disabled:opacity-60 transition-opacity sm:w-auto sm:min-w-[164px]"
                >
                  {state === "loading" ? "Subscribing..." : "Get the daily brief"}
                </button>
              </div>
              {state === "error" && (
                <p className="text-center text-[12px] sm:text-[13px] leading-snug text-error">
                  Something went wrong. Try again.
                </p>
              )}
              <p className="text-center text-[11px] leading-relaxed text-on-surface-variant/70">
                No spam. Unsubscribe any time.
              </p>
            </form>
          )}
        </div>

      </div>
    </section>
  );
}
