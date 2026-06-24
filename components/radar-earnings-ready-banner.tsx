import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Props = {
  docs: EarningsIntelDoc[];
};

export function RadarEarningsReadyBanner({ docs }: Props) {
  if (docs.length === 0) return null;

  const count = docs.length;
  const items = docs.slice(0, 3);

  return (
    <div className="flex min-w-0 w-full flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-4">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
            Earnings ready
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">
            {count === 1
              ? "Post-earnings report on your book"
              : `${count} post-earnings reports on your book`}
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-on-surface-variant">
          This week
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-[#f3f4f6]">
        {items.map((doc) => (
          <li key={doc.doc_id}>
            <Link
              href={`/earnings-intel/${encodeURIComponent(doc.ticker)}`}
              className="group flex items-start gap-2.5 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-surface-container-low -mx-1 px-1 rounded-lg"
            >
              <StockLogo
                ticker={doc.ticker}
                market={doc.market ?? "US"}
                size={32}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-on-surface group-hover:text-[#22d3ee] transition-colors">
                    {doc.ticker}
                  </span>
                  <span className="shrink-0 text-[10px] font-medium tabular-nums text-on-surface-variant">
                    {formatEventDate(doc.event_date)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-on-surface-variant">
                  {doc.report?.headline || "Report ready to read"}
                </p>
                {doc.report?.summary ? (
                  <p className="mt-1 text-[12px] leading-relaxed text-on-surface-variant">
                    {doc.report.summary}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {count > 3 ? (
        <Link
          href="/earnings-intel"
          className="text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          +{count - 3} more · View all earnings intel
        </Link>
      ) : count > 1 ? (
        <Link
          href="/earnings-intel"
          className="text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          View all on Earnings Intel
        </Link>
      ) : null}
    </div>
  );
}
