export function AgentResearchWalkthrough({ compact = false }: { compact?: boolean }) {
  return (
    <figure className="overflow-hidden border border-outline-variant bg-surface shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-low/55 px-4 py-3">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          Ask: What is the current case for NVDA?
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-on-surface-variant">Illustrative</span>
      </figcaption>

      <div className="grid md:grid-cols-2">
        <section className="border-b border-outline-variant p-5 md:border-b-0 md:border-r sm:p-6">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">Without a data connection</p>
          <h3 className="mt-2 text-[16px] font-extrabold tracking-tight text-on-surface">A broad answer.</h3>
          <p className="mt-4 text-[12px] leading-relaxed text-on-surface-variant">
            “Nvidia is a leader in AI chips with strong growth, but investors should consider competition and valuation risk.”
          </p>
          <dl className="mt-5 divide-y divide-outline-variant border-y border-outline-variant text-[10px]">
            <div className="flex justify-between gap-3 py-2.5"><dt className="text-on-surface-variant">Freshness</dt><dd className="font-semibold text-on-surface">Unclear</dd></div>
            <div className="flex justify-between gap-3 py-2.5"><dt className="text-on-surface-variant">Current call</dt><dd className="font-semibold text-on-surface">Not supplied</dd></div>
            {!compact ? <div className="flex justify-between gap-3 py-2.5"><dt className="text-on-surface-variant">Format</dt><dd className="font-semibold text-on-surface">General prose</dd></div> : null}
          </dl>
        </section>

        <section className="p-5 sm:p-6">
          <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-landing-brand">With Stocksbrew connected</p>
          <h3 className="mt-2 text-[16px] font-extrabold tracking-tight text-on-surface">A structured answer.</h3>
          <dl className="mt-4 divide-y divide-outline-variant border-y border-outline-variant text-[11px]">
            <div className="grid grid-cols-[92px_1fr] gap-3 py-2.5"><dt className="font-mono text-[9px] text-landing-brand">call</dt><dd className="text-on-surface">Current Stocksbrew view</dd></div>
            <div className="grid grid-cols-[92px_1fr] gap-3 py-2.5"><dt className="font-mono text-[9px] text-landing-brand">target</dt><dd className="text-on-surface">Price target and room</dd></div>
            <div className="grid grid-cols-[92px_1fr] gap-3 py-2.5"><dt className="font-mono text-[9px] text-landing-brand">evidence</dt><dd className="text-on-surface">Drivers and risks</dd></div>
            <div className="grid grid-cols-[92px_1fr] gap-3 py-2.5"><dt className="font-mono text-[9px] text-landing-brand">as_of</dt><dd className="text-on-surface">Timestamp and freshness</dd></div>
          </dl>
          <p className="mt-4 text-[10px] leading-relaxed text-on-surface-variant">
            The AI still does the reasoning. Stocksbrew gives it the stock context first.
          </p>
        </section>
      </div>
    </figure>
  );
}
