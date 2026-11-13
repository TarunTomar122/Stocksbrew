import Link from "next/link";

import { CARD_HOVER } from "@/components/briefing/stock-card";
import { NavIcon } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import { capitalize, dayWords } from "@/lib/day-words";
import type { CallMix, Finding, FindingQuote, FirstLookDecision } from "@/lib/first-look/types";

import { FOCUS } from "./grid";

/**
 * The first look's cards: each finding as its stock's logo, price and move, one big figure with what it is, and one
 * line; the decision as the agent's own card, with our call across the stocks as one bar. Server-safe.
 */

const TONE = { up: "text-signal-bullish", down: "text-signal-bearish", flat: "text-oa-fg" } as const;

function price(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(value: number): string {
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

function moveTone(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "text-oa-muted-fg";
  return value > 0 ? "text-signal-bullish" : "text-signal-bearish";
}

export const CARD = "oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 py-3";

export function FindingCard({ finding, quote, today }: { finding: Finding; quote: FindingQuote | null; today: string }) {
  // When it happened, in words (owner rule 4), for the one-off events; a report's line already says its day, and a
  // week's move or a price against its level is about now.
  // Only where the line does not already say the day: a filing, and an insider cluster ("in the past month").
  const dated = finding.kind === "filing" || (finding.kind === "insider" && finding.text.includes("past month"));
  const day = dated && finding.day ? capitalize(dayWords(finding.day, today)) : "";
  // A card about several stocks (all at their buy-more price) shows their logos, not one stock's price.
  const group = [finding.ticker, ...(finding.also ?? [])];
  return (
    <Link href={finding.href} title={`${finding.figureLabel}. Source: ${finding.source}`} className={`${CARD} ${CARD_HOVER} ${FOCUS}`}>
      <span className="flex min-w-0 items-start gap-2.5">
        {group.length > 1 ? (
          <span className="flex shrink-0 -space-x-2">
            {group.slice(0, 4).map((ticker) => (
              <StockLogo key={ticker} ticker={ticker} size={28} circle atOnce className="ring-2 ring-oa-card" />
            ))}
          </span>
        ) : (
          <StockLogo ticker={finding.ticker} size={28} circle atOnce className="shrink-0" />
        )}
        <span className="block min-w-0 flex-1 leading-5">
          <span className="oa-mono block truncate text-[14px] font-semibold text-oa-fg">{group.length > 1 ? (group.length > 4 ? `${group.slice(0, 3).join(" ")} +${group.length - 3}` : group.join(" ")) : finding.ticker}</span>
          {quote && group.length === 1 ? (
            <span className="oa-mono flex flex-wrap items-baseline gap-x-1.5 text-[12.5px] leading-4 tabular-nums">
              <span className="text-oa-muted-fg">{price(quote.price)}</span>
              {quote.dayPct !== null ? <span className={moveTone(quote.dayPct)}>{signed(quote.dayPct)} today</span> : null}
            </span>
          ) : null}
        </span>
        {day ? <span className="shrink-0 text-[12px] leading-5 text-oa-muted-fg">{day}</span> : null}
      </span>
      <span className="mt-2.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span className={`oa-mono text-[21px] font-semibold leading-7 tabular-nums ${TONE[finding.tone]}`}>{finding.figure}</span>
        <span className="text-[12px] text-oa-muted-fg">{finding.figureLabel}</span>
      </span>
      <span className="mt-0.5 block text-pretty text-[13.5px] leading-5 text-oa-fg">{finding.text}</span>
    </Link>
  );
}

/** Our call across the person's stocks: one bar, each call its share, the counts under it. */
export function CallBar({ mix, className = "" }: { mix: CallMix; className?: string }) {
  const total = mix.buyMore + mix.keep + mix.sellSome;
  const parts = [
    { label: "Buy more", count: mix.buyMore, fill: "bg-signal-bullish", text: "text-signal-bullish" },
    { label: "Keep", count: mix.keep, fill: "bg-oa-muted-fg/45", text: "text-oa-fg" },
    { label: "Sell some", count: mix.sellSome, fill: "bg-signal-bearish", text: "text-signal-bearish" },
  ].filter((part) => part.count > 0);
  return (
    <span className={`block ${className}`}>
      <span className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((part) => (
          <span key={part.label} className={`h-full ${part.fill}`} style={{ width: `${(part.count / total) * 100}%` }} />
        ))}
      </span>
      <span className="oa-mono mt-1.5 flex flex-wrap gap-x-3 text-[12px] leading-4 tabular-nums">
        {parts.map((part) => (
          <span key={part.label}>
            <span className={`font-semibold ${part.text}`}>{part.count}</span> <span className="text-oa-muted-fg">{part.label}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** The run's decision: the agent's card, first in the row. */
export function DecisionCard({ decision, calls, stocks }: { decision: FirstLookDecision; calls: CallMix | null; stocks: number }) {
  return (
    <div className={CARD}>
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary">
          <NavIcon name="agents" className="size-[16px]" />
        </span>
        <span className="min-w-0 text-[14px] font-semibold leading-5 text-oa-fg">
          My take on {stocks} {stocks === 1 ? "stock" : "stocks"}
        </span>
      </span>
      <span className={`mt-2.5 text-[21px] font-semibold leading-7 ${decision.urgent ? "text-oa-primary" : "text-oa-fg"}`}>{decision.figure}</span>
      <span className="mt-0.5 block text-pretty text-[13.5px] leading-5 text-oa-fg">{decision.text}</span>
      {calls ? <CallBar mix={calls} className="mt-auto pt-3" /> : null}
    </div>
  );
}

/**
 * The decision on its own (nothing found and nothing to set up beside it): one row across the panel, the take on the
 * left and our calls' bar on the right, so a lone card never stands tall over an empty row (owner rule 4).
 */
export function DecisionStrip({ decision, calls, stocks }: { decision: FirstLookDecision; calls: CallMix | null; stocks: number }) {
  return (
    <div className={`${CARD} gap-3 [@container(min-width:40rem)]:flex-row [@container(min-width:40rem)]:items-center`}>
      <span aria-hidden="true" className="hidden size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary [@container(min-width:40rem)]:flex">
        <NavIcon name="agents" className="size-[16px]" />
      </span>
      <span className="block min-w-0 flex-1">
        <span className={`block text-[17px] font-semibold leading-6 ${decision.urgent ? "text-oa-primary" : "text-oa-fg"}`}>
          {decision.figure}
          <span className="ml-2 text-[12.5px] font-normal text-oa-muted-fg">
            My take on {stocks} {stocks === 1 ? "stock" : "stocks"}
          </span>
        </span>
        <span className="mt-0.5 block text-pretty text-[13.5px] leading-5 text-oa-fg">{decision.text}</span>
      </span>
      {calls ? <CallBar mix={calls} className="w-full shrink-0 [@container(min-width:40rem)]:w-72" /> : null}
    </div>
  );
}
