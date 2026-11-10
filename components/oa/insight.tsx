import * as React from "react";
import Link from "next/link";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import type { Insight, TheRead as TheReadData } from "@/lib/insights";

/**
 * The page's read: a one-line headline, then up to three insights, each a
 * sentence with its number, the stocks it touches and where to act. Goes at
 * the top of a page or panel, above the data it was drawn from. Renders
 * nothing when there is no insight, so a page never shows an empty box.
 */
export function TheRead({ read, label = "The read", className = "" }: { read: TheReadData | null | undefined; label?: string; className?: string }) {
  if (!read || (!read.headline && read.insights.length === 0)) return null;
  return (
    <section aria-label={label} className={`oa-surface border border-oa-border bg-oa-card px-4 pb-3 pt-3.5 sm:px-5 sm:pb-3.5 sm:pt-4 ${className}`}>
      <p className="oa-label">{label}</p>
      {read.headline ? (
        <h2 className="mt-1 max-w-[46rem] text-pretty text-[19px] font-semibold leading-[26px] tracking-[-0.01em] text-oa-fg sm:text-[21px] sm:leading-[28px]">{read.headline}</h2>
      ) : null}
      {read.insights.length > 0 ? (
        <ul className="mt-3 divide-y divide-oa-border border-t border-oa-border">
          {read.insights.map((insight) => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
        </ul>
      ) : null}
      {read.source || read.asOf ? (
        <p className={`text-[12.5px] leading-[18px] text-oa-muted-fg ${read.insights.length > 0 ? "border-t border-oa-border pt-2.5" : "mt-2"}`}>
          {[read.source, read.asOf ? `as of ${fmtReadTime(read.asOf)}` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

export function InsightRow({ insight }: { insight: Insight }) {
  const tickers = insight.tickers ?? [];
  // One stock: its logo and ticker lead the row once, and a leading "SMR:" in
  // the sentence is dropped so the name never shows twice.
  const lead = tickers.length === 1 ? tickers[0]! : null;
  const text = lead ? stripLeadingTicker(insight.text, lead) : insight.text;
  // Several stocks: chips only for the ones the sentence (or its second clause) does not already name.
  const said = insight.soWhat ? `${text} ${insight.soWhat}` : text;
  const extra = lead ? [] : tickers.filter((ticker) => !mentions(said, ticker)).slice(0, 6);
  // Three columns on a wide screen: the tone mark, the sentence (with any
  // extra stocks under it), and the link to act, level with the first line.
  // On a phone the link drops under the sentence.
  return (
    <li
      // Any link in the row sends `insight_clicked` (lib/analytics-dom.ts), so we learn which reads people act on.
      data-track-links="insight_clicked"
      data-track-insight-id={insight.id.slice(0, 80)}
      data-track-insight-kind={insightKind(insight.id)}
      data-track-tone={insight.tone}
      className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 py-3 sm:grid-cols-[12px_minmax(0,1fr)_auto] sm:gap-x-4"
    >
      <ToneGlyph tone={insight.tone} className="mt-[7px]" />
      <div className="min-w-0 max-w-[60rem]">
        <div className="text-pretty text-[15px] leading-[22px] text-oa-fg">
          {lead ? (
            <Link
              href={`/stock/${encodeURIComponent(lead)}`}
              prefetch={false}
              data-track-target="stock"
              className="mr-1.5 inline-flex items-center gap-1.5 rounded align-[-4px] font-medium text-oa-fg hover:underline"
            >
              <StockLogo ticker={lead} size={18} />
              <span className="tabular-nums">{lead}</span>
            </Link>
          ) : null}
          {text}
          {insight.soWhat ? <span className="text-oa-muted-fg"> {insight.soWhat}</span> : null}
        </div>
        {extra.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            {extra.map((ticker) => (
              <Link
                key={ticker}
                href={`/stock/${encodeURIComponent(ticker)}`}
                prefetch={false}
                data-track-target="stock"
                className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium leading-5 text-oa-fg hover:underline"
              >
                <StockLogo ticker={ticker} size={16} />
                <span className="tabular-nums">{ticker}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {insight.action ? (
        <Link
          href={insight.action.href}
          prefetch={false}
          data-track-target="action"
          className="col-start-2 mt-1.5 justify-self-start whitespace-nowrap rounded text-[13px] font-medium leading-[22px] text-oa-primary hover:underline sm:col-start-3 sm:row-start-1 sm:mt-0 sm:justify-self-end"
        >
          {insight.action.label} →
        </Link>
      ) : null}
    </li>
  );
}

/** "mover-NVDA" -> "mover", "decisions" -> "decisions": the insight's kind without the stock in it. */
export function insightKind(id: string): string {
  return id.split(/[-:]/)[0]!.toLowerCase().slice(0, 32) || "insight";
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The row already leads with the ticker, so drop it from the start of the
 * sentence: "SMR: Our call moved" -> "Our call moved", "SMR rose 7%" -> "rose 7%".
 */
export function stripLeadingTicker(text: string, ticker: string): string {
  const match = new RegExp(`^\\s*\\$?${escapeRe(ticker)}(?![A-Za-z0-9])\\s*([:\u2014\u2013-])?\\s*`, "i").exec(text);
  if (!match) return text;
  const rest = text.slice(match[0].length);
  if (!rest) return text;
  return match[1] ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
}

function mentions(text: string, ticker: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])\\$?${escapeRe(ticker)}([^A-Za-z0-9]|$)`).test(text);
}

function fmtReadTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}
