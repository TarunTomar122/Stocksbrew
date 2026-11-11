import * as React from "react";

import { Delta, MarkSlot, NUM, Tag, fmtDay, type TagTone } from "@/components/oa/kit";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { FIELD_BY_ID, formatField, isFiniteNumber, type CallWord, type ScreenerRow, type Zone } from "@/lib/screener-shared";
import { historyJudged, markFor, multipleVsHistory, priceVsTarget, type Metric } from "@/lib/tone";

/** Presentational bits shared by the screener, the idea baskets and the compare desk. Server-safe. */

const CALL_TONES: Record<CallWord, TagTone> = { Add: "up", Hold: "neutral", Trim: "down" };


export function CallTag({ call }: { call: CallWord | null | undefined }) {
  if (!call) return null;
  return (
    <Tag tone={CALL_TONES[call]} caps={false} className="!h-6">
      {CALL_PLAIN[call]}
    </Tag>
  );
}

const ZONE_LABELS: Record<Zone, { text: string; tone: TagTone }> = {
  add: { text: "Buy range", tone: "up" },
  between: { text: "In between", tone: "neutral" },
  trim: { text: "Sell range", tone: "down" },
};

export function ZoneTag({ zone }: { zone: Zone | null | undefined }) {
  if (!zone) return null;
  const item = ZONE_LABELS[zone];
  return <Tag tone={item.tone}>{item.text}</Tag>;
}

/** A dash that reads as "we do not have this", never as a zero. */
export function Unknown() {
  return (
    <span className="text-oa-muted-fg" aria-label="not available">
      –
    </span>
  );
}

/**
 * Fields with a clear good and bad end, judged by the shared thresholds in `lib/tone` so a margin
 * gets the same mark here as on the stock page. Multiples, prices, yields and counts are left out:
 * on their own they are neither good nor bad.
 */
const FIELD_METRIC: Partial<Record<string, Metric>> = {
  gross_margin: "grossMargin",
  op_margin: "operatingMargin",
  net_margin: "netMargin",
  fcf_margin: "fcfMargin",
  roe: "roe",
  roic: "roic",
  debt_equity: "debtToEquity",
  current_ratio: "currentRatio",
  // Growth reads on the same yearly thresholds whatever the window: the 3-year figure is per year.
  rev_growth: "revenueGrowth",
  rev_cagr_3y: "revenueGrowth",
  eps_growth: "epsGrowth",
  eps_next_y: "epsGrowth",
  beta: "beta",
  drawdown_1y: "drawdown",
  score: "score",
  s_value: "score",
  s_growth: "score",
  s_quality: "score",
  s_momentum: "score",
};

/** Whether a field can carry a good-or-bad mark at all, so a column can keep a slot for it. */
export function fieldHasMark(id: string): boolean {
  return id in FIELD_METRIC || id === "pe_hist_pctile" || id === "upside";
}

/**
 * "up" or "down" when the value is clearly good or bad for the company, else nothing. P/E against
 * its own history needs the row's history window, and is only judged over a year of current data.
 */
export function fieldMark(id: string, value: unknown, row?: Pick<ScreenerRow, "pe_hist_from" | "pe_hist_to">): "up" | "down" | undefined {
  if (!isFiniteNumber(value)) return undefined;
  if (id === "pe_hist_pctile") {
    if (!row || !historyJudged(row.pe_hist_from, row.pe_hist_to, new Date().toISOString().slice(0, 10))) return undefined;
    const tone = multipleVsHistory(value)?.tone;
    return tone === "up" || tone === "down" ? tone : undefined;
  }
  if (id === "upside") {
    // The same 5% band as the stock page's "Below target" / "At target" chip, so +2% is not green here and "At target" there.
    const tone = priceVsTarget(value)?.tone;
    return tone === "up" || tone === "down" ? tone : undefined;
  }
  const metric = FIELD_METRIC[id];
  return metric ? markFor(metric, value) : undefined;
}

// The fixed glyph slot after a number lives in the kit; compare imports it from here.
export { MarkSlot };

/** One numeric field, formatted and coloured by its unit. */
export function FieldValue({
  id,
  value,
  row,
  className = "",
}: {
  id: string;
  value: unknown;
  /** The screener row, for fields judged against more than their own value (P/E against its history window). */
  row?: Pick<ScreenerRow, "pe_hist_from" | "pe_hist_to">;
  className?: string;
}) {
  const field = FIELD_BY_ID.get(id);
  if (!field || !isFiniteNumber(value)) {
    // In a marked column the dash keeps the mark's slot, so it lines up under the numbers above it.
    return fieldHasMark(id) ? (
      <span className={`inline-flex items-center justify-end gap-1 ${className}`}>
        <Unknown />
        <MarkSlot tone={null} />
      </span>
    ) : (
      <Unknown />
    );
  }
  if (fieldHasMark(id)) {
    // Judged figures stay in normal ink with a mark: the worst fall is always negative, so colouring by sign would
    // paint every row red, and +3% revenue growth would read green where the threshold calls it slow.
    return (
      <span className={`${NUM} inline-flex items-center justify-end gap-1 text-oa-fg ${className}`}>
        {formatField(field, value)}
        <MarkSlot tone={fieldMark(id, value, row)} />
      </span>
    );
  }
  // Distance to our zones has no good end on its own (the zone tag says where the price sits), so it stays in normal ink.
  if (field.call) return <span className={`${NUM} text-oa-fg ${className}`}>{formatField(field, value)}</span>;
  if (field.unit === "signed_pct") return <Delta value={value} digits={field.digits ?? 2} className={className} />;
  if (field.unit === "count_change") return <Delta value={value} digits={0} suffix="" className={className} />;
  return <span className={`${NUM} text-oa-fg ${className}`}>{formatField(field, value)}</span>;
}

/** "Nov 17 · after close" */
export function EarningsDate({ row }: { row: Pick<ScreenerRow, "earnings_date" | "earnings_time" | "earnings_in_days"> }) {
  if (!row.earnings_date) return <Unknown />;
  return (
    <span className={`${NUM} text-oa-fg`}>
      {fmtDay(row.earnings_date)}
      {row.earnings_time ? <span className="ml-1.5 text-[11.5px] text-oa-muted-fg">{row.earnings_time === "after close" ? "AMC" : "BMO"}</span> : null}
    </span>
  );
}

/** Small external-style arrow for links that leave the current tool. */
export function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M3.5 8h9M8.5 4l4 4-4 4" />
    </svg>
  );
}

export { CONTROL, CONTROL_ACTIVE } from "@/components/screener/controls";
