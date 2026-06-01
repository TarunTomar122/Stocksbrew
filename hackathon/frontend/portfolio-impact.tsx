type Props = {
  allocation: number;
  allocationChange: string;
  contribution: string;
  contributionLabel: string;
  riskExposure: string;
  correlatedAssets: string[];
  notes: string;
};

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "border-[#d1fae5] text-[#047857] bg-[#f0fdf4]",
    moderate: "border-[#fde68a] text-[#b45309] bg-[#fffbeb]",
    high: "border-[#fecaca] text-[#b91c1c] bg-[#fef2f2]",
  };
  return (
    <span
      className={`inline-flex h-[20px] items-center border px-2 text-[10px] font-semibold tracking-[0.06em] uppercase ${
        colors[level] ?? "border-[#e5e7eb] text-[#6b7280] bg-[#f9fafb]"
      }`}
    >
      {level}
    </span>
  );
}

export function PortfolioImpact({
  allocation,
  allocationChange,
  contribution,
  contributionLabel,
  riskExposure,
  correlatedAssets,
  notes,
}: Props) {
  return (
    <section
      aria-labelledby="portfolio-impact-heading"
      className="flex flex-col gap-5"
    >
      <h2
        id="portfolio-impact-heading"
        className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]"
      >
        Portfolio Impact
      </h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9ca3af] mb-0.5">
            Allocation
          </dt>
          <dd className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[22px] font-semibold tracking-[-0.02em] text-[#111111] tabular-nums">
              {allocation}%
            </span>
            <span className="text-[12px] text-[#059669] font-medium tabular-nums">
              +{allocationChange}%
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9ca3af] mb-0.5">
            Contribution
          </dt>
          <dd>
            <span className="text-[22px] font-semibold tracking-[-0.02em] text-[#111111] tabular-nums">
              +{contribution}%
            </span>
            <p className="mt-0.5 text-[11px] leading-snug text-[#6b7280]">
              {contributionLabel}
            </p>
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 py-3 border-y border-[#f3f4f6]">
        <span className="text-[12px] text-[#6b7280]">Risk exposure</span>
        <RiskBadge level={riskExposure} />
      </div>

      <div>
        <span className="mb-2 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
          Correlated assets
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {correlatedAssets.map((ticker) => (
            <li
              key={ticker}
              className="inline-flex items-center border border-[#e5e7eb] bg-white px-2.5 py-0.5 text-[11px] font-mono text-[#374151]"
            >
              {ticker}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[13px] text-[#6b7280] leading-[1.6] border-t border-[#f3f4f6] pt-4">
        {notes}
      </p>
    </section>
  );
}
