import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { CorrectCall } from "@/lib/track-record";

function CallCard({ call }: { call: CorrectCall }) {
  const movePct = typeof call.dayChangePct === "number" && Number.isFinite(call.dayChangePct)
    ? call.dayChangePct
    : null;
  const up = movePct != null && movePct >= 0;
  const changeColor = up ? "#10b981" : "#ef4444";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";

  return (
    <Link
      href={call.ticker ? `/stock/${encodeURIComponent(call.ticker)}` : "/events"}
      className="group flex h-full w-[260px] shrink-0 flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white p-4 transition-shadow hover:border-[#d1d5db] hover:shadow-[0_4px_14px_rgba(17,24,39,0.06)]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StockLogo ticker={call.ticker} market="US" size={28} logoUrl={call.logoUrl} />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff] transition-colors">
            {call.ticker}
          </span>
        </div>
        {movePct != null && (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span
              className="inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums"
              style={{ background: changeBg, color: changeColor }}
            >
              {up ? "▲" : "▼"} {Math.abs(movePct).toFixed(1)}%
            </span>
            <span className="text-[10px] font-medium text-[#9ca3af]">on earnings day</span>
          </div>
        )}
      </div>
      <div className="flex items-start gap-1.5">
        <AnimatedIcon name="check_circle" size={16} className="mt-[2px] shrink-0 text-[#10b981]" aria-hidden />
        <span className="text-left text-[13px] font-medium leading-snug text-[#374151]">
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
          Pre-earnings calls that landed
        </h2>
        <p className="text-[14px] leading-relaxed text-[#6b7280]">
          Our setup went live before each print. The move shown is from earnings day, not today.
        </p>
      </div>

      <div className="w-full max-w-4xl overflow-x-auto py-4 scrollbar-hide md:py-5">
        <div className="flex w-max min-w-full flex-nowrap items-stretch justify-center gap-3 md:gap-4">
          {calls.slice(0, 4).map((call) => (
            <CallCard key={`${call.ticker}-${call.eventDate}`} call={call} />
          ))}
        </div>
      </div>
    </section>
  );
}
