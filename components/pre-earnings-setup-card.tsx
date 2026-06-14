import type { PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import {
  EPS_OUTCOME_LINES,
  EPS_OUTLOOK_LABELS,
  POST_PRINT_MOVE_LABELS,
  STOCK_OUTCOME_LINES,
  cleanEarningsProse,
  daysUntilEventDate,
  epsOutlookTone,
  normalizeEpsOutlook,
  normalizePostPrintMove,
  postPrintMoveTone,
} from "@/lib/pre-earnings-intel-shared";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysLabel(eventDate: string): string {
  const d = daysUntilEventDate(eventDate);
  if (d === null) return "";
  if (d === 1) return "Tomorrow";
  if (d > 1) return `In ${d} days`;
  return "";
}

type Props = {
  doc: PreEarningsIntelDoc;
  ticker: string;
  compact?: boolean;
};

export function PreEarningsSetupCard({ doc, ticker, compact = false }: Props) {
  const outlook = normalizeEpsOutlook(doc.report?.call?.eps_outlook);
  const move = normalizePostPrintMove(doc.report?.call?.post_print_move);
  const confidence = doc.report?.confidence?.score_0_100;
  const outlookStyle = epsOutlookTone(outlook);
  const moveStyle = postPrintMoveTone(move);
  const when = daysLabel(doc.event_date);
  const headline = cleanEarningsProse(doc.report?.headline || `${ticker} before the print`);
  const summary = cleanEarningsProse(
    doc.report?.summary || "Setup for the upcoming earnings report.",
  );
  const holders = doc.report?.decision_guide?.for_holders
    ? cleanEarningsProse(doc.report.decision_guide.for_holders)
    : "";
  const watchers = doc.report?.decision_guide?.for_watchers
    ? cleanEarningsProse(doc.report.decision_guide.for_watchers)
    : "";

  return (
    <section
      className={`flex flex-col gap-4 rounded-2xl border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-[#fff7ed] ${
        compact ? "p-4" : "p-5 md:p-6"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6b7280]">
        <span className="font-semibold text-[#92400e]">Before earnings</span>
        <span>Reports {formatEventDate(doc.event_date)}</span>
        {when ? <span className="font-semibold text-[#b45309]">{when}</span> : null}
        {confidence != null && Number.isFinite(confidence) ? (
          <span className="tabular-nums font-semibold text-[#111111]">
            {Math.round(confidence)}% confidence
          </span>
        ) : null}
      </div>

      {(outlook || move) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {outlook ? (
            <div
              className="rounded-xl border bg-white/90 px-4 py-3 flex flex-col gap-1"
              style={{ borderColor: outlookStyle.text }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
                EPS prediction
              </span>
              <span
                className="text-[17px] font-semibold leading-snug"
                style={{ color: outlookStyle.text }}
              >
                {EPS_OUTLOOK_LABELS[outlook]}
              </span>
              <span className="text-[11px] leading-snug text-[#6b7280]">
                {EPS_OUTCOME_LINES[outlook]}
              </span>
            </div>
          ) : null}
          {move ? (
            <div
              className="rounded-xl border bg-white/90 px-4 py-3 flex flex-col gap-1"
              style={{ borderColor: moveStyle.text }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ca3af]">
                Stock prediction
              </span>
              <span
                className="text-[17px] font-semibold leading-snug"
                style={{ color: moveStyle.text }}
              >
                {POST_PRINT_MOVE_LABELS[move]}
              </span>
              <span className="text-[11px] leading-snug text-[#6b7280]">
                {STOCK_OUTCOME_LINES[move]}
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3
          className={`font-semibold tracking-tight text-[#111111] leading-snug ${
            compact ? "text-lg" : "text-xl md:text-2xl"
          }`}
        >
          {headline}
        </h3>
        <p className={`leading-relaxed text-[#374151] ${compact ? "text-sm" : "text-base"}`}>
          {summary}
        </p>
      </div>

      {!compact && (holders || watchers) ? (
        <div className="rounded-xl border border-[#e5e7eb] bg-white/90 p-4 flex flex-col gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#111111]">
            What to do
          </p>
          {holders ? (
            <div>
              <p className="text-[11px] font-semibold text-[#6b7280]">If you hold</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-[#111111]">{holders}</p>
            </div>
          ) : null}
          {watchers ? (
            <div>
              <p className="text-[11px] font-semibold text-[#6b7280]">If you are watching</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-[#111111]">{watchers}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-[#9ca3af]">Not investment advice</p>
    </section>
  );
}
