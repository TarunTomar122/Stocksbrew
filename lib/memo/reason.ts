import type { ScreenerRow } from "@/lib/screener-shared";

import { addDays } from "./week";

/** Words in a call's stored line; "Hold here." says nothing. */
const MIN_REASON_WORDS = 6;

/** The screener's reason is today's; it only speaks for a change this recent. */
const CURRENT_REASON_DAYS = 7;

/**
 * Why the call changed: the company-specific reason the screener carries for
 * the current call (backend/call_reason.py), when the change led to it and is
 * recent (an older week must not quote figures written after it); else the
 * call history's own line when it says something.
 */
export function callReason(
  row: Pick<ScreenerRow, "call" | "call_reason"> | null | undefined,
  change: { to: string; text: string | null; date: string },
  today: string,
): string | null {
  const recent = change.date >= addDays(today, -CURRENT_REASON_DAYS);
  const current = recent && row?.call && row.call === change.to && typeof row.call_reason === "string" ? row.call_reason.trim() : "";
  if (current.split(/\s+/).length >= MIN_REASON_WORDS) return current;
  const own = (change.text ?? "").trim();
  return own.split(/\s+/).length >= MIN_REASON_WORDS ? own : null;
}
