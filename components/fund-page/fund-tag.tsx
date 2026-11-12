/** The small "Fund" tag beside an ETF in search results; only fund rows carry it. */
export function FundTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[color-mix(in_srgb,var(--oa-fg,currentColor)_8%,transparent)] px-1.5 text-[11px] font-medium leading-none text-oa-muted-fg ${className}`}>
      Fund
    </span>
  );
}
