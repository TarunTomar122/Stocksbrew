import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { CorrectCall } from "@/lib/track-record";

function CallCard({ call }: { call: CorrectCall }) {
  const up = (call.dayChangePct ?? 0) >= 0;
  const changeColor = up ? "#10b981" : "#ef4444";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";

  return (
    <Link
      href={call.ticker ? `/stock/${encodeURIComponent(call.ticker)}` : "/events"}
      className="group flex min-w-[230px] shrink-0 snap-start flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm md:min-w-0"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StockLogo ticker={call.ticker} market="US" size={28} logoUrl={call.logoUrl} />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
            {call.ticker}
          </span>
        </div>
        {call.dayChangePct != null && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums"
            style={{ background: changeBg, color: changeColor }}
          >
            {up ? "▲" : "▼"} {Math.abs(call.dayChangePct).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="material-symbols-outlined text-[#10b981]"
          style={{ fontSize: 16, fontVariationSettings: "'wght' 600" }}
        >
          check_circle
        </span>
        <span className="text-[13px] font-medium leading-snug text-[#374151]">
          {call.call}
        </span>
      </div>
    </Link>
  );
}

export function TrackRecordBar({ calls }: { calls: CorrectCall[] }) {
  if (!calls || calls.length < 3) return null;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#0052ff]">
          The receipts
        </span>
        <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight">
          We make the calls before the print. Here is how the last ones landed.
        </h2>
        <p className="max-w-[640px] text-[14px] leading-relaxed text-[#6b7280]">
          Every name below had a stocksbrew read going into earnings, and the stock did what we said it would.
          We show the misses too, on the stock pages.
        </p>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-visible md:pb-0">
        {calls.slice(0, 4).map((call) => (
          <CallCard key={`${call.ticker}-${call.eventDate}`} call={call} />
        ))}
      </div>
    </section>
  );
}
