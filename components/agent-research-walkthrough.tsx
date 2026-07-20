const CHECKS = [
  ["get_stock_intelligence", "NVDA", "call · target · drivers · risks"],
  ["get_stock_intelligence", "AMD", "call · target · drivers · risks"],
  ["compare_stocks", "NVDA, AMD", "valuation · growth · momentum"],
  ["get_market_brief", "US", "market regime · sector context"],
] as const;

export function AgentResearchWalkthrough({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden border border-outline-variant bg-surface shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-low/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-landing-brand" />
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
            Example research run
          </span>
        </div>
        <span className="font-mono text-[9px] text-on-surface-variant">Stocksbrew · read-only</span>
      </div>

      <div className={`grid min-w-0 ${compact ? "md:grid-cols-[116px_minmax(0,1fr)]" : "lg:grid-cols-[150px_minmax(0,1fr)_170px]"}`}>
        <nav className="hidden border-r border-outline-variant bg-surface-container-low/35 p-3 md:block" aria-label="Example run sections">
          <p className="px-2 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Run</p>
          <ol className="mt-3 space-y-1 text-[10px]">
            <li className="border-l-2 border-landing-brand bg-surface px-2 py-2 font-semibold text-on-surface">1 · Question</li>
            <li className="border-l-2 border-transparent px-2 py-2 text-on-surface-variant">2 · Research</li>
            <li className="border-l-2 border-transparent px-2 py-2 text-on-surface-variant">3 · Decision</li>
          </ol>
        </nav>

        <article className="min-w-0 p-4 sm:p-6">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">You ask</p>
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-on-surface">
            Compare NVDA and AMD. What is already priced in, where does the target room come from, and what would change the call?
          </p>

          <div className="mt-5 border-y border-outline-variant">
            {CHECKS.slice(0, compact ? 3 : 4).map(([tool, input, output]) => (
              <div key={`${tool}-${input}`} className="grid gap-1 border-b border-outline-variant/70 py-2.5 last:border-b-0 sm:grid-cols-[150px_80px_1fr] sm:items-center">
                <code className="text-[9px] font-semibold text-landing-brand">{tool}</code>
                <span className="font-mono text-[9px] text-on-surface">{input}</span>
                <span className="text-[10px] text-on-surface-variant">{output}</span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-landing-brand">Decision brief</p>
              <span className="text-[9px] text-on-surface-variant">freshness attached to every source</span>
            </div>
            <h3 className="mt-2 text-[16px] font-extrabold tracking-tight text-on-surface">A comparison you can act on—not four tabs of data.</h3>
            <div className="mt-4 space-y-3 text-[11px] leading-relaxed text-on-surface-variant sm:text-[12px]">
              <p><strong className="text-on-surface">What separates them.</strong> The agent explains which company leads on growth quality and momentum, then shows whether that advantage already carries a valuation premium.</p>
              <p><strong className="text-on-surface">Where the target room comes from.</strong> It ties each target to fundamentals, current price, and the assumptions that have to hold—not just a naked percentage.</p>
              {!compact ? <p><strong className="text-on-surface">What changes the decision.</strong> The final section names earnings, margin, momentum, and market-regime triggers that would strengthen or invalidate the current call.</p> : null}
            </div>
            <p className="mt-4 border-l-2 border-landing-brand pl-3 text-[10px] italic leading-relaxed text-on-surface-variant">
              Illustrative workflow. Your agent receives current Stocksbrew values and timestamps when it runs the tools.
            </p>
          </div>
        </article>

        {!compact ? (
          <aside className="hidden border-l border-outline-variant bg-surface-container-low/35 p-4 lg:block">
            <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Why this helps</p>
            <dl className="mt-4 space-y-4 text-[10px] leading-relaxed">
              <div><dt className="font-semibold text-on-surface">One question</dt><dd className="mt-1 text-on-surface-variant">Coordinates stock, comparison, and market context.</dd></div>
              <div><dt className="font-semibold text-on-surface">Your Radar</dt><dd className="mt-1 text-on-surface-variant">Can add position context and recent changes.</dd></div>
              <div><dt className="font-semibold text-on-surface">Bounded output</dt><dd className="mt-1 text-on-surface-variant">No trading or account write access.</dd></div>
            </dl>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
