import Link from "next/link";

import type { SubscribeBenefit } from "@/lib/subscribe-benefits";

function BenefitCard({
  benefit,
  compact,
}: {
  benefit: SubscribeBenefit;
  compact: boolean;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className="material-symbols-outlined mt-0.5 shrink-0 text-[#111111]"
        style={{ fontSize: 20, fontVariationSettings: "'wght' 500" }}
      >
        {benefit.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold text-[#111111]">{benefit.title}</span>
        <span className="text-[12px] leading-snug text-[#6b7280]">{benefit.body}</span>
        {benefit.href ? (
          <span className="text-[11px] font-semibold text-[#0052ff] group-hover:underline">
            {benefit.linkLabel ?? "Open"} →
          </span>
        ) : null}
      </div>
    </>
  );

  const className = `group flex gap-3 rounded-2xl bg-[#fafafa] ${
    compact ? "px-3.5 py-3" : "px-4 py-3"
  } ${benefit.href ? "transition-colors hover:border hover:border-[#e5e7eb] hover:bg-white" : ""}`;

  if (benefit.href) {
    return (
      <Link href={benefit.href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}

export function ProBenefitsGrid({
  benefits,
  compact = false,
}: {
  benefits: SubscribeBenefit[];
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
      {benefits.map((benefit) => (
        <BenefitCard key={benefit.title} benefit={benefit} compact={compact} />
      ))}
    </div>
  );
}
