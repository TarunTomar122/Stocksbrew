"use client";

import { useEffect, useState } from "react";

import {
  isUsPremarketWindow,
  millisecondsUntilUsMarketOpen,
  type LivePremarketQuote,
} from "@/lib/premarket-shared";

type Props = {
  currency: string;
  market: "US" | "IN";
  quote: LivePremarketQuote;
};

function formatPrice(currency: string, value: number): string {
  return `${currency}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function snapshotLabel(generatedAt: string): string {
  const generated = new Date(generatedAt);
  if (!Number.isFinite(generated.getTime())) return "Pre-market";
  return `Pre-market snapshot from ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(generated)}`;
}

export function StockPremarketQuote({ currency, market, quote }: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (market !== "US" || !isUsPremarketWindow()) {
      setVisible(false);
      return;
    }

    const milliseconds = millisecondsUntilUsMarketOpen();
    const timeout = window.setTimeout(
      () => setVisible(false),
      milliseconds + 50,
    );
    return () => window.clearTimeout(timeout);
  }, [market]);

  if (!visible) return null;

  const positive = quote.changePct >= 0;
  const arrow = positive ? "▲" : "▼";
  const tone = positive ? "var(--signal-bullish)" : "var(--signal-bearish)";

  return (
    <div
      className="mt-1.5 inline-flex items-center justify-end gap-1.5 rounded-md border border-outline-variant/60 bg-surface px-2 py-1 font-mono text-[10px] tabular-nums shadow-sm"
      title={snapshotLabel(quote.generatedAt)}
      aria-label={`${snapshotLabel(quote.generatedAt)}: ${formatPrice(currency, quote.price)}, ${quote.changePct >= 0 ? "up" : "down"} ${Math.abs(quote.changePct).toFixed(2)} percent`}
    >
      <span className="font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
        pre-market
      </span>
      <span className="font-bold text-on-surface">
        {formatPrice(currency, quote.price)}
      </span>
      <span className="font-semibold" style={{ color: tone }}>
        {arrow} {quote.changePct >= 0 ? "+" : ""}
        {quote.changePct.toFixed(2)}%
      </span>
    </div>
  );
}
