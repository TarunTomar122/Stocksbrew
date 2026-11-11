"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { LONG_RATES, SHORT_RATES } from "@/lib/portfolio-ideas/tax";
import type { TaxRates } from "@/lib/portfolio-ideas/types";

/**
 * The two rates the tax estimates assume. A change rewrites the address
 * (?short=24&long=15) so the server recomputes every estimate and the read
 * from the same numbers, and the link keeps the person's choice.
 */
export function RatePicker({ rates }: { rates: TaxRates }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  // Shown at once; the page catches up when the server has redone the sums.
  const [shown, setShown] = useState(rates);
  useEffect(() => setShown(rates), [rates.short, rates.long]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (next: TaxRates) => {
    setShown(next);
    start(() => router.replace(`${pathname}?short=${next.short}&long=${next.long}`, { scroll: false }));
  };
  const select = `outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] oa-mono h-9 w-full rounded border border-oa-border bg-oa-bg px-2 text-[14px] tabular-nums text-oa-fg`;
  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] leading-[18px] text-oa-muted-fg">Held a year or less</span>
          <select className={select} value={shown.short} onChange={(event) => go({ ...shown, short: Number(event.target.value) })}>
            {SHORT_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}%
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] leading-[18px] text-oa-muted-fg">Held over a year</span>
          <select className={select} value={shown.long} onChange={(event) => go({ ...shown, long: Number(event.target.value) })}>
            {LONG_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
        {pending
          ? "Working out the tax again at these rates."
          : "Short-term gains are taxed like income, so pick your income bracket on the left. Long-term gains are taxed at 0%, 15% or 20% by income, and 15% is the usual one."}
      </p>
    </div>
  );
}
