"use client";

import { usePublicPathname } from "@/lib/use-public-pathname";
import { useState } from "react";

import { UnlistedStockDiscoveryModal } from "@/components/unlisted-stock-discovery-modal";

/** The ticker in a /stock/<T> address, or null when the address cannot hold one. */
export function tickerFromStockPath(pathname: string | null): string | null {
  const match = /^\/stock\/([^/]+)/.exec(pathname ?? "");
  if (!match) return null;
  let raw = match[1]!;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const upper = raw.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(upper) ? upper : null;
}

/**
 * On the 404 for a stock we do not hold: ask us to add it. The request
 * (and the optional email for when it lands) goes through the same modal
 * the old "not in our library yet" page opened on its own.
 */
export function StockRequestCard() {
  const ticker = tickerFromStockPath(usePublicPathname());
  const [open, setOpen] = useState(false);
  if (!ticker) return null;
  return (
    <div className="oa-surface mb-4 border border-oa-border bg-oa-card px-4 py-3.5">
      <p className="text-[15px] font-medium leading-[22px] text-oa-fg">
        We do not cover <span className="oa-mono tabular-nums">{ticker}</span> yet.
      </p>
      <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">
        If it is a US-listed stock, ask us to add it. We research requested tickers and the report appears at this address.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex h-9 items-center rounded-md bg-oa-primary px-3.5 text-[14px] font-medium text-oa-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring"
      >
        Ask us to add {ticker}
      </button>
      {open ? <UnlistedStockDiscoveryModal ticker={ticker} onDismiss={() => setOpen(false)} /> : null}
    </div>
  );
}
