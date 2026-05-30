import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import {
  cleanEarningsProse,
  daysUntilEventDate,
  epsOutlookLabel,
  epsOutlookTone,
  normalizeEpsOutlook,
  normalizePostPrintMove,
  postPrintMoveLabel,
  postPrintMoveTone,
} from "@/lib/pre-earnings-intel-shared";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Props = {
  docs: PreEarningsIntelDoc[];
};

export function RadarEarningsUpcomingBanner({ docs }: Props) {
  if (docs.length === 0) return null;

  const count = docs.length;

  return (
    <div className="min-w-0 w-full rounded-2xl border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-[#fff7ed] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#b45309] ring-1 ring-[#fde68a]"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              event_upcoming
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#b45309]">
              Reporting soon
            </p>
            <p className="text-[12px] text-[#6b7280] leading-snug mt-0.5">
              {count === 1
                ? "Pre-earnings setup on your book"
                : `${count} pre-earnings setups on your book`}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[#9ca3af] whitespace-nowrap">
          Next 7d
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {docs.slice(0, 3).map((doc) => {
          const outlook = normalizeEpsOutlook(doc.report?.call?.eps_outlook);
          const move = normalizePostPrintMove(doc.report?.call?.post_print_move);
          const outlookText = epsOutlookLabel(doc.report?.call?.eps_outlook);
          const moveText = postPrintMoveLabel(doc.report?.call?.post_print_move);
          const outlookStyle = epsOutlookTone(outlook);
          const moveStyle = postPrintMoveTone(move);
          const days = daysUntilEventDate(doc.event_date);
          return (
            <li key={doc.doc_id}>
              <Link
                href={`/stock/${encodeURIComponent(doc.ticker)}#stock-section-earnings`}
                className="flex items-start gap-2.5 rounded-xl bg-white/80 px-3 py-2.5 ring-1 ring-[#fde68a]/80 transition-colors hover:bg-white hover:ring-[#fbbf24] group"
              >
                <StockLogo
                  ticker={doc.ticker}
                  market={doc.market ?? "US"}
                  size={28}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#b45309] transition-colors">
                      {doc.ticker}
                    </span>
                    <span className="text-[10px] font-medium text-[#9ca3af] shrink-0">
                      {days === 1 ? "Tomorrow" : formatEventDate(doc.event_date)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[#4b5563]">
                    {cleanEarningsProse(doc.report?.headline || "Setup before the print")}
                  </p>
                  {(outlookText || moveText) ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {outlookText ? (
                        <span
                          className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: outlookStyle.bg, color: outlookStyle.text }}
                        >
                          {outlookText}
                        </span>
                      ) : null}
                      {moveText ? (
                        <span
                          className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: moveStyle.bg, color: moveStyle.text }}
                        >
                          {moveText}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {count > 3 ? (
        <Link
          href="/upcoming-events"
          className="text-[11px] font-semibold text-[#b45309] hover:text-[#d97706] transition-colors"
        >
          +{count - 3} more · See all upcoming →
        </Link>
      ) : count > 1 ? (
        <Link
          href="/upcoming-events"
          className="text-[11px] font-semibold text-[#b45309] hover:text-[#d97706] transition-colors"
        >
          See all upcoming setups →
        </Link>
      ) : null}
    </div>
  );
}
