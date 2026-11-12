import Link from "next/link";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import type { Insight } from "@/lib/insights";

/**
 * One insight as a row: its tone mark, the sentence (led by its stock's logo and name when it is about one), and
 * the whole row opening its main step. The page-top "read" with its insight cards is gone (owner, Nov 12: "super
 * useless to me ... I would rather just go into the details myself"); rows like this one stay inside lists.
 */
export function InsightRow({ insight }: { insight: Insight }) {
  const tickers = insight.tickers ?? [];
  // One stock: its logo and ticker lead the row once, and a leading "SMR:" in
  // the sentence is dropped so the name never shows twice.
  // Only when the sentence is about that stock (it starts with it); otherwise
  // a logo in front of "Over the past month the group..." reads as its subject.
  const lead = tickers.length === 1 && startsWithTicker(insight.text, tickers[0]!) ? tickers[0]! : null;
  const text = lead ? stripLeadingTicker(insight.text, lead) : insight.text;
  // Several stocks: chips only for the ones the sentence (or its second clause) does not already name.
  const said = insight.soWhat ? `${text} ${insight.soWhat}` : text;
  // A sentence that names its stocks needs no chips; extra chips under "BHE, NVDA and TSM" read as a mismatch.
  const namesAny = tickers.some((ticker) => mentions(said, ticker));
  const extra = lead || namesAny ? [] : tickers.slice(0, 6);
  // The row link's name is its step ("Why did it fall?"); the sentence describes it.
  const sentenceId = `insight-row-${insight.id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 60)}`;
  // Two columns: the tone mark and the sentence (with any extra stocks under it). The whole row opens its main
  // step, the way a read card does: no link words repeated on every row (owner, Nov 11). Stock links sit above it.
  return (
    <li
      // Any link in the row sends `insight_clicked` (lib/analytics-dom.ts), so we learn which reads people act on.
      data-track-links="insight_clicked"
      data-track-insight-id={insight.id.slice(0, 80)}
      data-track-insight-kind={insightKind(insight.id)}
      data-track-tone={insight.tone}
      className={`relative grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 py-3 ${insight.action ? "transition-colors hover:bg-oa-accent" : ""}`}
    >
      <ToneGlyph tone={insight.tone} className="mt-[7px]" />
      <div className="min-w-0 max-w-[60rem]">
        <div id={sentenceId} className="text-pretty text-[15px] leading-[22px] text-oa-fg">
          {lead ? (
            <Link
              href={`/stock/${encodeURIComponent(lead)}`}
              prefetch={false}
              data-track-target="stock"
              className="relative z-10 mr-1.5 inline-flex items-center gap-1.5 rounded align-[-4px] font-medium text-oa-fg hover:underline"
            >
              <StockLogo ticker={lead} size={18} />
              {insight.leadName ? <span title={lead}>{insight.leadName}</span> : <span className="tabular-nums">{lead}</span>}
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
                className="relative z-10 inline-flex items-center gap-1.5 rounded text-[13px] font-medium leading-5 text-oa-fg hover:underline"
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
          aria-label={insight.action.label}
          aria-describedby={sentenceId}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
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

function startsWithTicker(text: string, ticker: string): boolean {
  return new RegExp(`^\\s*\\$?${escapeRe(ticker)}(?![A-Za-z0-9])`).test(text);
}

function mentions(text: string, ticker: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])\\$?${escapeRe(ticker)}([^A-Za-z0-9]|$)`).test(text);
}
