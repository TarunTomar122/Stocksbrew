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

  const flat = Math.abs(quote.changePct) < 0.005;
  const tone = flat ? "text-oa-fg" : quote.changePct > 0 ? "text-signal-bullish" : "text-signal-bearish";
  const sign = flat ? "" : quote.changePct > 0 ? "+" : "−";

  // The same pill as "Opens in …" beside it, in the app's own tokens: plain words, the price, the move in its tone
  // (owner, Nov 12: the old all-caps chip with arrows was "cooked").
  return (
    <span
      className="inline-flex h-8 items-center gap-2 rounded-full border border-oa-border bg-oa-card px-3 text-[13px] leading-none"
      title={snapshotLabel(quote.generatedAt)}
      aria-label={`${snapshotLabel(quote.generatedAt)}: ${formatPrice(currency, quote.price)}, ${quote.changePct >= 0 ? "up" : "down"} ${Math.abs(quote.changePct).toFixed(2)} percent`}
    >
      <span className="text-oa-muted-fg">Before the open</span>
      <span className="oa-mono font-semibold tabular-nums text-oa-fg">{formatPrice(currency, quote.price)}</span>
      <span className={`oa-mono font-semibold tabular-nums ${tone}`}>
        {sign}
        {Math.abs(quote.changePct).toFixed(2)}%
      </span>
    </span>
  );
}
