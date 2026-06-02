import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import {
  cleanEarningsProse,
  daysUntilEventDate,
  epsOutlookLabel,
  normalizeEpsOutlook,
  normalizePostPrintMove,
  postPrintMoveLabel,
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
  const items = docs.slice(0, 3);

  return (
    <div className="flex min-w-0 w-full flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
            Reporting soon
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-[#6b7280]">
            {count === 1
              ? "Pre-earnings setup on your book"
              : `${count} pre-earnings setups on your book`}
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tabular-nums text-[#9ca3af]">
          Next 7d
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-[#f3f4f6]">
        {items.map((doc) => {
          const outlook = normalizeEpsOutlook(doc.report?.call?.eps_outlook);
          const move = normalizePostPrintMove(doc.report?.call?.post_print_move);
          const outlookText = outlook ? epsOutlookLabel(doc.report?.call?.eps_outlook) : "";
          const moveText = move ? postPrintMoveLabel(doc.report?.call?.post_print_move) : "";
          const days = daysUntilEventDate(doc.event_date);
          const tags = [outlookText, moveText].filter(Boolean);

          return (
            <li key={doc.doc_id}>
              <Link
                href={`/stock/${encodeURIComponent(doc.ticker)}#stock-section-earnings`}
                className="group flex items-start gap-2.5 py-3 transition-colors first:pt-0 last:pb-0 hover:bg-[#fafafa] -mx-1 px-1 rounded-lg"
              >
                <StockLogo
                  ticker={doc.ticker}
                  market={doc.market ?? "US"}
                  size={32}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                      {doc.ticker}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-[#9ca3af]">
                      {days === 1 ? "Tomorrow" : formatEventDate(doc.event_date)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[#4b5563]">
                    {cleanEarningsProse(doc.report?.headline || "Setup before the print")}
                  </p>
                  {tags.length > 0 ? (
                    <p className="mt-1 text-[10px] font-medium text-[#9ca3af]">
                      {tags.join(" · ")}
                    </p>
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
          className="text-[11px] font-semibold text-[#6b7280] hover:text-[#111111] transition-colors"
        >
          +{count - 3} more · See all upcoming
        </Link>
      ) : count > 1 ? (
        <Link
          href="/upcoming-events"
          className="text-[11px] font-semibold text-[#6b7280] hover:text-[#111111] transition-colors"
        >
          See all upcoming setups
        </Link>
      ) : null}
    </div>
  );
}
