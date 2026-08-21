import Link from "next/link";

import type { SubscribeBenefit } from "@/lib/subscribe-benefits";

function BenefitCard({ benefit }: { benefit: SubscribeBenefit }) {
  const content = (
    <>
      <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-oa-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-oa-fg">{benefit.title}</span>
        <span className="text-sm leading-6 text-oa-muted-fg">{benefit.body}</span>
        {benefit.href ? (
          <span className="text-sm font-medium text-oa-fg underline decoration-oa-border underline-offset-4">
            {benefit.linkLabel ?? "Open"}
          </span>
        ) : null}
      </div>
    </>
  );

  if (benefit.href) {
    return (
      <Link
        href={benefit.href}
        className="group flex gap-3 rounded-[18px] border border-oa-border bg-oa-bg px-4 py-3 outline-none transition-colors hover:bg-oa-accent focus-visible:bg-oa-accent"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex gap-3 rounded-[18px] border border-oa-border bg-oa-bg px-4 py-3">
      {content}
    </div>
  );
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
        <BenefitCard key={benefit.title} benefit={benefit} />
      ))}
    </div>
  );
}
