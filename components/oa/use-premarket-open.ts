"use client";

import * as React from "react";

import { getMarketSessionState } from "@/lib/market-session";

/**
 * True from 4:00 ET until the 9:30 open on a trading day, the only time Premarket has something current to say
 * (owner, Nov 12: "premarket should only be shown until the stock market opens that day"). False on the server and
 * on the first render, so cached HTML never disagrees with the browser; the item joins the nav after mount, and
 * leaves it at the open without a reload.
 */
export function usePremarketOpen(): boolean {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const check = () => setOpen(getMarketSessionState().kind === "premarket");
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return open;
}
