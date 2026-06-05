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
      className="group flex h-full w-full shrink-0 flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-all hover:border-[#111111] hover:shadow-sm"
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
    <section className="flex flex-col items-center gap-6 text-center">
      <div className="flex max-w-2xl flex-col items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#0052ff]">
          The receipts
        </span>
        <h2 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.02em] text-[#111111] leading-tight">
          Earnings moves we called before they happened
        </h2>
        <p className="text-[14px] leading-relaxed text-[#6b7280]">
          We published a setup before each report below. The stock moved the way we said it would.
          Misses are on the stock pages too.
        </p>
      </div>

      <div className="flex w-full max-w-4xl flex-wrap justify-center gap-3">
        {calls.slice(0, 4).map((call) => (
          <div key={`${call.ticker}-${call.eventDate}`} className="w-full min-w-[230px] max-w-[280px] flex-1 sm:flex-none">
            <CallCard call={call} />
          </div>
        ))}
      </div>
    </section>
  );
}
