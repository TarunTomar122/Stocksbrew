"use client";

import Link from "next/link";

type Props = {
  days: 7 | 30;
};

export function AnalyticsPeriodToggle({ days }: Props) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--oa-border)] bg-[var(--oa-bg)] p-1">
      {([7, 30] as const).map((option) => {
        const active = days === option;
        return (
          <Link
            key={option}
            href={option === 7 ? "/dev/analytics" : `/dev/analytics?days=${option}`}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-oa-card text-[var(--oa-fg)] shadow-sm"
                : "text-[var(--oa-muted-fg)] hover:text-[var(--oa-fg)]"
            }`}
          >
            {option} days
          </Link>
        );
      })}
    </div>
  );
}
