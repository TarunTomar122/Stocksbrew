/** Holds the page's shape while the plan loads: the read, the twelve bars, the list. */
export function DividendsGhost() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-3">
      <div className="oa-surface h-[132px] border border-oa-border bg-oa-card" />
      <div className="oa-surface h-[250px] border border-oa-border bg-oa-card" />
      <div className="oa-surface h-[220px] border border-oa-border bg-oa-card" />
    </div>
  );
}
