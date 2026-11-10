"use client";

import { useEffect } from "react";

import { captureEvent } from "@/lib/posthog";

export function StockPageAnalytics({
  ticker,
  instrumentId,
  isSubscribed,
  isTracked,
  hasAiBrief,
  hasCrowdSignal,
  call = null,
  plan,
  levels,
}: {
  ticker: string;
  instrumentId: string;
  isSubscribed: boolean;
  isTracked: boolean;
  hasAiBrief: boolean;
  hasCrowdSignal: boolean;
  /** The call word shown at the top (buy, hold, ...): `stock_viewed` doubles as "call viewed". */
  call?: string | null;
  plan?: "anon" | "free" | "pro";
  /** Whether the full read (zones, reasons) was unlocked for this viewer. */
  levels?: boolean;
}) {
  useEffect(() => {
    captureEvent("stock_viewed", {
      ticker,
      instrument_id: instrumentId,
      call,
      has_call: Boolean(call),
      full_read: levels,
      plan,
      subscribed: isSubscribed,
      is_tracked: isTracked,
      has_ai_brief: hasAiBrief,
      has_crowd_signal: hasCrowdSignal,
    });
  }, [ticker, instrumentId, isSubscribed, isTracked, hasAiBrief, hasCrowdSignal, call, plan, levels]);

  return null;
}
