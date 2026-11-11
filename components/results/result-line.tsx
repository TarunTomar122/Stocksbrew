import { shortDay } from "@/lib/read-format";
import type { ResultSummary } from "@/lib/results/types";

const TONE = { up: "text-signal-bullish", down: "text-signal-bearish", flat: "text-oa-fg" } as const;

/** One line for a stock that just reported: "Nov 10: Beat by 18%, up 25% today". The full read is on the stock page. */
export function ResultLine({ result, today, className = "" }: { result: ResultSummary; today: string; className?: string }) {
  const day = result.reportDate === today ? "Today" : shortDay(result.reportDate);
  const cut = result.fact.indexOf(", ");
  const lead = cut > 0 ? result.fact.slice(0, cut) : result.fact;
  const rest = cut > 0 ? result.fact.slice(cut + 2) : "";
  return (
    <span className={`block text-[12.5px] leading-5 ${className}`} title={result.sentence}>
      <span className="oa-mono tabular-nums text-oa-muted-fg">{day}: </span>
      {/* The result takes its colour; the move after it keeps the ink, so "beat, down 14%" never reads all green. */}
      <span className={`font-medium ${TONE[result.tone]}`}>{lead}</span>
      {rest ? <span className="text-oa-fg">, {rest}</span> : null}
    </span>
  );
}
