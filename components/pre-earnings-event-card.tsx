import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { PreEarningsCardQuote, PreEarningsIntelDoc } from "@/lib/pre-earnings-intel-shared";
import { currencySymbolFor } from "@/lib/utils";
import {
  cleanEarningsProse,
  epsOutlookLabel,
  epsOutlookTone,
  normalizeEpsOutlook,
  normalizePostPrintMove,
  postPrintMoveLabel,
  postPrintMoveTone,
} from "@/lib/pre-earnings-intel-shared";

type Props = {
  doc: PreEarningsIntelDoc;
  name?: string;
  logoUrl?: string | null;
  quote?: PreEarningsCardQuote;
};

function fmtPrice(value: number, market: PreEarningsIntelDoc["market"]): string {
  const symbol = currencySymbolFor(market);
  if (value >= 1000) {
    return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  return `${symbol}${value.toFixed(2)}`;
}

function fmtPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function sectorLabel(raw?: string): string | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

export function PreEarningsEventCard({ doc, name, logoUrl, quote }: Props) {
  const href = `/stock/${encodeURIComponent(doc.ticker)}`;
  const outlook = normalizeEpsOutlook(doc.report?.call?.eps_outlook);
  const move = normalizePostPrintMove(doc.report?.call?.post_print_move);
  const outlookText = epsOutlookLabel(doc.report?.call?.eps_outlook);
  const moveText = postPrintMoveLabel(doc.report?.call?.post_print_move);
  const confidence = doc.report?.confidence?.score_0_100;
  const outlookStyle = epsOutlookTone(outlook);
  const moveStyle = postPrintMoveTone(move);
  const sector = sectorLabel(quote?.sector);
  const hasPrice = typeof quote?.price === "number" && Number.isFinite(quote.price);
  const hasChange =
    typeof quote?.dayChangePct === "number" && Number.isFinite(quote.dayChangePct);
  const changeUp = hasChange && quote!.dayChangePct! >= 0;

  return (
    <Link
      href={href}
      className="pre-earnings-event-card group flex h-full flex-col gap-3 rounded-[20px] border border-[#fde68a] bg-gradient-to-b from-[#fffbeb] to-white p-4 transition-all hover:border-[#f59e0b] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <StockLogo ticker={doc.ticker} market={doc.market} size={36} logoUrl={logoUrl} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-[#111111] group-hover:text-[#b45309] transition-colors">
              {doc.ticker}
            </span>
            {name ? (
              <span className="truncate text-[11px] text-[#9ca3af] max-w-[160px]">{name}</span>
            ) : null}
            {sector ? (
              <span className="truncate text-[10px] font-medium text-[#9ca3af] max-w-[160px]">
                {sector}
              </span>
            ) : null}
          </div>
        </div>
        {hasPrice || hasChange ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {hasPrice ? (
              <span className="text-[12px] font-semibold tabular-nums text-[#111111]">
                {fmtPrice(quote!.price!, doc.market)}
              </span>
            ) : null}
            {hasChange ? (
              <span
                className="text-[11px] font-semibold tabular-nums"
                style={{ color: changeUp ? "#047857" : "#b91c1c" }}
              >
                {fmtPct(quote!.dayChangePct!)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-[13px] font-medium leading-snug text-[#111111] group-hover:text-[#b45309] transition-colors">
        {cleanEarningsProse(
          doc.report?.headline || doc.report?.summary || "Pre-earnings setup",
        )}
      </p>
      {doc.report?.summary && doc.report?.headline ? (
        <p className="text-[12px] leading-relaxed text-[#4b5563]">
          {cleanEarningsProse(doc.report.summary)}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {outlookText ? (
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: outlookStyle.bg, color: outlookStyle.text }}
          >
            {outlookText}
          </span>
        ) : null}
        {moveText ? (
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: moveStyle.bg, color: moveStyle.text }}
          >
            {moveText}
          </span>
        ) : null}
        {confidence != null && Number.isFinite(confidence) ? (
          <span className="inline-flex rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#374151]">
            {Math.round(confidence)} conf.
          </span>
        ) : null}
      </div>
    </Link>
  );
}
