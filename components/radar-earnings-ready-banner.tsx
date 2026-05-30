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

  return (
    <div className="min-w-0 w-full rounded-2xl border border-[#e9d5ff] bg-gradient-to-br from-[#faf5ff] to-[#eff6ff] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#6b38d4] ring-1 ring-[#e9d5ff]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              analytics
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#6b38d4]">
              Earnings ready
            </p>
            <p className="text-[12px] text-[#6b7280] leading-snug mt-0.5">
              {count === 1
                ? "Post-earnings report on your book"
                : `${count} post-earnings reports on your book`}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[#9ca3af] shrink-0">
          This week
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {docs.slice(0, 3).map((doc) => (
          <li key={doc.doc_id}>
            <Link
              href={`/earnings-intel/${encodeURIComponent(doc.ticker)}`}
              className="flex items-start gap-2.5 rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-[#e9d5ff]/80 transition-colors hover:bg-white hover:ring-[#c4b5fd] group"
            >
              <StockLogo
                ticker={doc.ticker}
                market={doc.market ?? "US"}
                size={28}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                    {doc.ticker}
                  </span>
                  <span className="text-[10px] font-medium text-[#9ca3af] shrink-0">
                    {formatEventDate(doc.event_date)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[#4b5563]">
                  {doc.report?.headline || "Report ready to read"}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {count > 3 ? (
        <Link
          href="/earnings-intel"
          className="text-[11px] font-semibold text-[#6b38d4] hover:text-[#0052ff] transition-colors"
        >
          +{count - 3} more · View all earnings intel →
        </Link>
      ) : count > 1 ? (
        <Link
          href="/earnings-intel"
          className="text-[11px] font-semibold text-[#6b38d4] hover:text-[#0052ff] transition-colors"
        >
          View all on Earnings Intel →
        </Link>
      ) : null}
    </div>
  );
}
