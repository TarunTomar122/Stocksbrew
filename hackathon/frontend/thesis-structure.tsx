import type { ThesisDraft } from "../types";

type Props = {
  thesis: ThesisDraft;
};

function DriverBadge({ polarity }: { polarity: "bullish" | "bearish" }) {
  const isBull = polarity === "bullish";
  return (
    <span
      className={`shrink-0 inline-flex h-[20px] items-center px-2 text-[10px] font-semibold tracking-[0.06em] uppercase border ${
        isBull
          ? "border-[#d1fae5] text-[#047857] bg-[#f0fdf4]"
          : "border-[#fecaca] text-[#b91c1c] bg-[#fef2f2]"
      }`}
    >
      {polarity}
    </span>
  );
}

export function ThesisStructure({ thesis }: Props) {
  if (!thesis) return null;

  return (
    <article className="flex flex-col gap-7 md:gap-8">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]">
          Compiled Thesis
        </h2>
        <p className="text-[11px] text-[#9ca3af] font-mono tabular-nums">
          {thesis.drivers.length} drivers · {thesis.entities.length} entities
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-12 gap-x-6 gap-y-6 md:gap-y-8 pb-7 md:pb-8 border-b border-[#f3f4f6]">
        <div className="col-span-1 md:col-span-2">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
            Horizon
          </span>
          <p className="text-[15px] text-[#111111] tabular-nums">
            {thesis.horizonMonths} mo
          </p>
        </div>
        <div className="col-span-1 md:col-span-3">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
            Sectors
          </span>
          <p className="text-[14px] leading-snug text-[#111111]">
            {thesis.sectors.join(", ") || "Unassigned"}
          </p>
        </div>
        <div className="col-span-2 md:col-span-7">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
            Summary
          </span>
          <p className="text-[14px] leading-[1.6] text-[#374151]">
            {thesis.summary}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
        <div>
          <span className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
            Beneficiaries
          </span>
          <div className="flex flex-wrap gap-1.5">
            {thesis.beneficiaryTickers.map((ticker) => (
              <span
                key={ticker}
                className="inline-flex items-center border border-[#d1fae5] bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-mono text-[#047857]"
              >
                {ticker}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
            Risk Names
          </span>
          <div className="flex flex-wrap gap-1.5">
            {thesis.riskTickers.length > 0 ? (
              thesis.riskTickers.map((ticker) => (
                <span
                  key={ticker}
                  className="inline-flex items-center border border-[#fecaca] bg-[#fef2f2] px-2 py-0.5 text-[11px] font-mono text-[#b91c1c]"
                >
                  {ticker}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-[#9ca3af]">
                No explicit risk names yet
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <span className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
          Entities
        </span>
        <div className="flex flex-wrap gap-1.5">
          {thesis.entities.map((e) => (
            <span
              key={e.name}
              className="inline-flex items-center gap-1.5 border border-[#e5e7eb] bg-white px-2.5 py-1 text-[12px] text-[#374151]"
            >
              {e.name}
              {e.ticker && (
                <span className="font-mono text-[10px] text-[#9ca3af]">
                  {e.ticker}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-3 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
          Drivers
        </span>
        <ul className="divide-y divide-[#f3f4f6] border-t border-[#f3f4f6]">
          {thesis.drivers.map((d) => (
            <li
              key={d.id}
              className="flex items-start gap-3 py-3.5 first:pt-3"
            >
              <DriverBadge polarity={d.polarity} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-[1.55] text-[#111111]">
                  {d.label}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] font-mono text-[#9ca3af]">
                    {d.horizon} · {d.category} · {(d.weight * 100).toFixed(0)}%
                  </span>
                  {d.trackedEntityNames.length > 0 && (
                    <span className="text-[10px] text-[#6b7280]">
                      {d.trackedEntityNames.join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <span className="mb-3 block text-[11px] font-medium uppercase tracking-[0.08em] text-[#9ca3af]">
          Disproof Conditions
        </span>
        <ul className="flex flex-col gap-2">
          {thesis.disproofConditions.map((dc) => (
            <li
              key={dc.id}
              className="text-[13px] leading-[1.55] text-[#6b7280] pl-3 border-l-2 border-[#d1d5db]"
            >
              {dc.condition}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
