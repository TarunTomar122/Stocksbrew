"use client";

import * as React from "react";

import { Spinner } from "@/components/oa/button";
import type { ResearchStep } from "@/lib/research/types";

/** The live list of research steps: what is being read now, and what each step found. */
export function ResearchProgress({ steps, startedAt }: { steps: ResearchStep[]; startedAt: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  const busy = steps.some((step) => step.status === "running" || step.status === "pending");
  React.useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const done = steps.filter((step) => step.status !== "pending" && step.status !== "running").length;
  const seconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : null;
  const current = steps.find((step) => step.status === "running");
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium leading-6 text-oa-fg" aria-live="polite">
          {current ? `${current.label}...` : busy ? "Starting..." : "Done"}
        </p>
        <p className="oa-mono shrink-0 text-[12px] tabular-nums text-oa-muted-fg">
          {done} of {steps.length}
          {seconds !== null ? ` · ${seconds}s` : ""}
        </p>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-oa-bg">
        <div className="h-full rounded-full bg-oa-primary transition-[width] duration-500 ease-out" style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} />
      </div>
      <ol className="mt-3 flex flex-col">
        {steps.map((step) => (
          <li key={step.id} className="flex min-h-9 items-start gap-2.5 py-1.5">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
              {step.status === "running" ? (
                <Spinner className="size-3.5 text-oa-primary" />
              ) : step.status === "done" ? (
                <svg viewBox="0 0 16 16" className="size-4 text-signal-bullish" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              ) : step.status === "failed" ? (
                <span className="text-[13px] font-semibold text-signal-bearish">!</span>
              ) : step.status === "empty" ? (
                <span className="block h-0.5 w-2.5 rounded bg-oa-muted-fg" />
              ) : (
                <span className="block size-1.5 rounded-full bg-oa-border" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[14px] leading-5 ${step.status === "pending" ? "text-oa-muted-fg" : "text-oa-fg"}`}>{step.label}</span>
              {step.detail ? <span className="block text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{step.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
