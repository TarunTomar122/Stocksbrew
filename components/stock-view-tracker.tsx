"use client";

import { useEffect } from "react";

type Props = {
  ticker: string;
  instrumentId: string;
  market: "US" | "IN";
};

export function StockViewTracker({ ticker, instrumentId, market }: Props) {
  useEffect(() => {
    const storageKey = `tikrr_stock_view:${instrumentId}`;
    const anonKey = "tikrr_anon_id";
    const throttleMs = 6 * 60 * 60 * 1000;
    let anonId = "";
    try {
      const last = Number(window.localStorage.getItem(storageKey) || "0");
      if (Number.isFinite(last) && Date.now() - last < throttleMs) return;
      anonId = window.localStorage.getItem(anonKey) || "";
      if (!anonId) {
        anonId = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
        window.localStorage.setItem(anonKey, anonId);
      }
    } catch {
      // If storage is unavailable, still record the view; the server buckets writes.
    }
    const payload = {
      ticker,
      instrument_id: instrumentId,
      market,
      anon_id: anonId || undefined,
    };
    // A short visible-page dwell filters accidental bounces, link previews,
    // and most non-browser crawlers before demand can spend research budget.
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      try {
        window.localStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // The server still buckets and rate-limits storage-disabled browsers.
      }
      fetch("/api/stock-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => undefined);
    }, 4_000);

    return () => window.clearTimeout(timer);
  }, [ticker, instrumentId, market]);

  return null;
}
