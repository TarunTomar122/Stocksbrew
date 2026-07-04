"use client";

import Link from "next/link";

type Props = {
  days: 7 | 30;
};

export function AnalyticsPeriodToggle({ days }: Props) {
  return (
    <div className="inline-flex rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-1">
      {([7, 30] as const).map((option) => {
        const active = days === option;
        return (
          <Link
            key={option}
            href={`/dev/analytics?days=${option}`}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-white text-[#111111] shadow-sm"
                : "text-[#6b7280] hover:text-[#111111]"
            }`}
          >
            {option} days
          </Link>
        );
      })}
    </div>
  );
}
