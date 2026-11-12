"use client";

import * as React from "react";

import { getMarketSessionState } from "@/lib/market-session";

/** Asks whether this morning's premarket is in (app/api/premarket/quotes with no tickers; cached at the edge). */
export const PREMARKET_READY_URL = "/api/premarket/quotes";

/** Whether this morning's premarket numbers are in, or null when the answer could not be read. */
export async function fetchPremarketReady(fetcher: typeof fetch = fetch, timeoutMs = 4000): Promise<boolean | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(PREMARKET_READY_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as { live?: unknown };
    return body?.live === true;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One answer shared by every nav that asks (the sidebar and the place nav both do), for under a minute. */
let shared: { at: number; answer: Promise<boolean | null> } | null = null;
const SHARED_MS = 55_000;

function premarketReady(): Promise<boolean | null> {
  const now = Date.now();
  if (!shared || now - shared.at > SHARED_MS) shared = { at: now, answer: fetchPremarketReady() };
  return shared.answer;
}

/**
 * True from 4:00 ET until the 9:30 open on a trading day, and only once this morning's premarket numbers are in
 * (owner, Nov 12: "premarket should only be shown until the stock market opens that day", and "we shouldnt show
 * premarket unless we have it for today"). False on the server and on the first render, so cached HTML never
 * disagrees with the browser; the item joins the nav after mount once the numbers are in, and leaves it at the open
 * without a reload. While premarket runs without today's numbers it asks again each minute.
 */
export function usePremarketOpen(): boolean {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    let ready = false;
    let asking = false;
    const check = async () => {
      if (getMarketSessionState().kind !== "premarket") {
        ready = false;
        setOpen(false);
        return;
      }
      if (ready) {
        setOpen(true);
        return;
      }
      if (asking) return;
      asking = true;
      const answer = await premarketReady();
      asking = false;
      if (!alive) return;
      ready = answer === true;
      setOpen(ready && getMarketSessionState().kind === "premarket");
    };
    void check();
    const timer = window.setInterval(() => void check(), 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return open;
}
