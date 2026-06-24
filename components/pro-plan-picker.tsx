"use client";

import Link from "next/link";
import { useState } from "react";

export function ProPlanPicker() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");

  const ring = (on: boolean) =>
    on
      ? { boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--signal-bullish) 60%, transparent)" }
      : { boxShadow: "inset 0 0 0 1px var(--outline-variant)" };

  return (
    <>
      <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
        <button type="button" onClick={() => setPlan("monthly")} aria-pressed={plan === "monthly"} className="panel p-5 text-left transition-all" style={ring(plan === "monthly")}>
          <p className="font-mono text-[12px] text-on-surface-variant">monthly</p>
          <p className="mt-1 font-mono text-3xl font-bold text-on-surface">$12<span className="text-[13px] font-normal text-on-surface-variant">/mo</span></p>
        </button>
        <button type="button" onClick={() => setPlan("yearly")} aria-pressed={plan === "yearly"} className="panel p-5 text-left transition-all" style={ring(plan === "yearly")}>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[12px]" style={{ color: "var(--signal-bullish)" }}>yearly · 3 days free</p>
            <span className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ background: "var(--signal-bullish)", color: "var(--background)" }}>SAVE 31%</span>
          </div>
          <p className="mt-1 font-mono text-3xl font-bold text-on-surface">$99<span className="text-[13px] font-normal text-on-surface-variant">/yr</span></p>
        </button>
      </div>

      <Link
        href={`/subscribe?plan=${plan}`}
        className="mt-6 inline-block rounded px-6 py-3 font-mono text-sm font-bold transition-opacity hover:opacity-90"
        style={{ background: "var(--signal-bullish)", color: "var(--background)" }}
      >
        activate Pro →
      </Link>
      <p className="mt-3 font-mono text-[11px] text-on-surface-variant">secure checkout · cancel anytime</p>
    </>
  );
}
