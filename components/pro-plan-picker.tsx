"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import Link from "next/link";
import { useState, type ReactNode } from "react";

const PLANS = {
  monthly: {
    label: "Monthly",
    price: 12,
    suffix: "/mo",
    detail: "Billed monthly",
  },
  yearly: {
    label: "Yearly",
    price: 99,
    suffix: "/yr",
    detail: "$8.25/mo billed annually",
    trial: "3 days free",
    save: "Save 31%",
    bestValue: true,
  },
} as const;

function PlanOption({
  id,
  selected,
  onSelect,
  children,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      aria-pressed={selected}
      onClick={onSelect}
      className={`pro-plan-option ${selected ? "pro-plan-option-selected" : ""}`}
    >
      {children}
    </button>
  );
}

export function ProPlanPicker() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");
  const yearly = PLANS.yearly;
  const monthly = PLANS.monthly;

  return (
    <div className="pro-plan-panel">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
            Choose your plan
          </p>
          <p className="mt-1 text-[13px] text-on-surface-variant">Unlimited Radar, calls, and alerts</p>
        </div>
        <span className="rounded-full border border-outline-variant bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-landing-brand">
          Pro
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PlanOption id="plan-monthly" selected={plan === "monthly"} onSelect={() => setPlan("monthly")}>
          <span className="pro-plan-radio" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-on-surface">{monthly.label}</span>
            <span className="mt-0.5 block text-[11px] text-on-surface-variant">{monthly.detail}</span>
            <span className="mt-3 flex items-baseline gap-1">
              <span className="text-[2rem] font-bold leading-none tracking-tight text-on-surface">${monthly.price}</span>
              <span className="text-[13px] font-medium text-on-surface-variant">{monthly.suffix}</span>
            </span>
          </span>
        </PlanOption>

        <PlanOption id="plan-yearly" selected={plan === "yearly"} onSelect={() => setPlan("yearly")}>
          {yearly.bestValue ? <span className="pro-plan-best-value">Best value</span> : null}
          <span className="pro-plan-radio" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-on-surface">{yearly.label}</span>
              <span className="pro-plan-trial-pill">{yearly.trial}</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-landing-brand">{yearly.save}</span>
            <span className="mt-3 flex items-baseline gap-1">
              <span className="text-[2rem] font-bold leading-none tracking-tight text-on-surface">${yearly.price}</span>
              <span className="text-[13px] font-medium text-on-surface-variant">{yearly.suffix}</span>
            </span>
            <span className="mt-1 block text-[11px] text-on-surface-variant">{yearly.detail}</span>
          </span>
        </PlanOption>
      </div>

      <Link href={`/subscribe?plan=${plan}`} className="pro-plan-cta mt-5">
        {plan === "yearly" ? "Start 3-day free trial" : "Activate Pro"}
        <span aria-hidden>→</span>
      </Link>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-on-surface-variant">
        <AnimatedIcon name="lock" size={14} className="text-[14px]" />
        Secure checkout · cancel anytime
      </p>
    </div>
  );
}
