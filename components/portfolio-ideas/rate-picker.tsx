"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { LONG_RATES, SHORT_RATES } from "@/lib/portfolio-ideas/tax";
import type { TaxRates } from "@/lib/portfolio-ideas/types";

/**
 * The two rates the tax figures assume, as two small selects in a section header ("Short-term 24%", "Long-term
 * 15%"). A change rewrites the address (?short=24&long=15) so the server works every figure out again, and the link
 * keeps the choice. What the rates mean lives in the page's "How we work these out".
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
  const select =
    "oa-mono h-7 cursor-pointer rounded border border-oa-border bg-oa-bg pl-1.5 pr-1 text-[13px] tabular-nums text-oa-fg outline-none focus-visible:border-oa-fg";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-oa-muted-fg ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <label className="flex items-center gap-1.5" title="Gains on shares held a year or less are taxed like income: pick your bracket.">
        Short-term
        <select className={select} value={shown.short} onChange={(event) => go({ ...shown, short: Number(event.target.value) })}>
          {SHORT_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}%
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5" title="Gains on shares held over a year are taxed at 0%, 15% or 20%; 15% is the usual one.">
        Long-term
        <select className={select} value={shown.long} onChange={(event) => go({ ...shown, long: Number(event.target.value) })}>
          {LONG_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}%
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
