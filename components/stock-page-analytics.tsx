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
}: {
  ticker: string;
  instrumentId: string;
  isSubscribed: boolean;
  isTracked: boolean;
  hasAiBrief: boolean;
  hasCrowdSignal: boolean;
}) {
  useEffect(() => {
    captureEvent("stock_viewed", {
      ticker,
      instrument_id: instrumentId,
      subscribed: isSubscribed,
      is_tracked: isTracked,
      has_ai_brief: hasAiBrief,
      has_crowd_signal: hasCrowdSignal,
    });
  }, [ticker, instrumentId, isSubscribed, isTracked, hasAiBrief, hasCrowdSignal]);

  return null;
}
