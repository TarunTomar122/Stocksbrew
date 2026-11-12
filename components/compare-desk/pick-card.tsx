import * as React from "react";
import Link from "next/link";

import { NUM } from "@/components/oa/kit";
import { SignedBar, ToneGlyph } from "@/components/oa/kit/tone";
import { VsBar } from "@/components/oa/kit/vs-bar";
import { CallTag } from "@/components/screener/shared";
import { StockLogo } from "@/components/stock-logo";
import { pickPlaceWord, type ComparePick, type PickPlace, type PickReason } from "@/lib/compare-pick";
import { shortCompanyName } from "@/lib/plain-copy";

/**
 * "Our pick of these", right after the compare table (owner, Nov 12: "after this table in comparison we need winner and
 * reasons why winner"). The pick, its verdict and up to three reasons, each one line with a bar per stock on that
 * measure; where it loses; then the rest in order with the one thing each would need. When the top is too close to
 * call, each of the close ones gets what it leads on instead. The scoring is lib/compare-pick.ts.
 */

const LEAD_BAR = "var(--signal-bullish)";
const OTHER_BAR = "color-mix(in srgb, var(--oa-muted-fg) 42%, transparent)";

/** One line and a bar per stock, the best of all of them in green; `who` names the stock the line is about (too close). */
function Reason({ reason, who }: { reason: PickReason; who?: string }) {
  const spoken = reason.bars.map((bar) => `${bar.symbol} ${bar.text}`).join(", ");
  return (
    <div className="flex min-w-0 flex-col gap-2 bg-oa-card px-4 py-3">
      <p className="text-pretty text-[14.5px] leading-5 text-oa-fg">
        {who ? (
          <span className="mr-1.5 inline-flex items-center gap-1.5 align-[-3px]">
            <StockLogo ticker={who} size={16} />
            <span className={`${NUM} font-semibold`}>{who}</span>
          </span>
        ) : null}
        {reason.text}
      </p>
      <span className="sr-only">{spoken}.</span>
      <div aria-hidden="true" className="mt-auto flex flex-col gap-1" title={reason.mark ? `The tick is the ${reason.mark.label}, ${reason.mark.text}` : undefined}>
        {reason.bars.map((bar) => (
          <div key={bar.symbol} className="grid grid-cols-[3.25rem_minmax(0,1fr)_4rem] items-center gap-2">
            <span className={`${NUM} truncate text-[12px] leading-4 ${bar.lead ? "font-semibold text-oa-fg" : "text-oa-muted-fg"}`}>{bar.symbol}</span>
            {/* Wrapped so a figure with no bar ("no growth") keeps its grid cell. */}
            <span className="min-w-0">
              <SignedBar
                value={bar.value}
                domain={reason.domain}
                color={bar.lead ? LEAD_BAR : OTHER_BAR}
                mark={reason.mark?.value ?? null}
                markColor="color-mix(in srgb, var(--oa-fg) 55%, transparent)"
                className="h-1.5"
              />
            </span>
            <span className={`${NUM} whitespace-nowrap text-right text-[12px] leading-4 ${bar.lead ? "font-semibold text-oa-fg" : "text-oa-muted-fg"}`}>{bar.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const GRID_COLS = ["", "", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-2 lg:grid-cols-4"] as const;

/** Reasons side by side, as many columns as there are reasons (four go two by two first), so every row is full. */
function ReasonGrid({ items }: { items: Array<{ reason: PickReason; who?: string }> }) {
  if (items.length === 0) return null;
  return (
    // 1px gaps over the border colour draw the lines between cells, however the grid wraps. Every block after the
    // header opens with its own top line, so a missing block never leaves a doubled one.
    <div className={`grid grid-cols-1 gap-px border-t border-oa-border bg-oa-border ${GRID_COLS[Math.min(items.length, 4)]}`}>
      {items.map((item) => (
        <Reason key={`${item.who ?? ""}${item.reason.measure}`} reason={item.reason} who={item.who} />
      ))}
    </div>
  );
}

function Score({ place, hidden, className = "" }: { place: PickPlace; hidden: boolean; className?: string }) {
  // When our call set the order, a Buy more can sit above a Sell some with a higher score; the numbers would contradict
  // the order, so none are shown and the call chips carry it.
  if (hidden) return null;
  return (
    <span className={`${NUM} inline-flex items-baseline gap-1 whitespace-nowrap ${className}`} title="Our pick score of these, out of 100">
      <span className="text-[15px] font-semibold text-oa-fg">{place.score}</span>
      <span className="text-[12px] text-oa-muted-fg">/100</span>
    </span>
  );
}

/** The rest, best first: place, the stock, its call and score, and the one thing it would need. The row opens the stock. */
function RunnerUps({ places, hideScores }: { places: PickPlace[]; hideScores: boolean }) {
  if (places.length === 0) return null;
  return (
    <ul className="border-t border-oa-border">
      {places.map((place) => (
        <li key={place.symbol} className="relative border-b border-oa-border last:border-b-0 hover:bg-oa-accent">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="inline-flex shrink-0 items-center gap-2">
              <span className={`${NUM} w-7 text-[12.5px] text-oa-muted-fg`}>{pickPlaceWord(place.place)}</span>
              <StockLogo ticker={place.symbol} size={20} />
              <span className={`${NUM} text-[14.5px] font-medium text-oa-fg`}>{place.symbol}</span>
              <CallTag call={place.call} />
              <Score place={place} hidden={hideScores} className="ml-1" />
            </span>
            {place.need ? <span className="min-w-0 text-pretty text-[14px] leading-5 text-oa-muted-fg max-sm:basis-full max-sm:pl-9 sm:ml-auto sm:text-right">{place.need}</span> : null}
          </div>
          <Link
            href={`/stock/${encodeURIComponent(place.symbol)}`}
            prefetch={false}
            aria-label={`${place.symbol}, ${pickPlaceWord(place.place)} of these`}
            className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          />
        </li>
      ))}
    </ul>
  );
}

export function PickCard({ pick, names }: { pick: ComparePick; names: Record<string, string | undefined> }) {
  if (pick.kind === "close") {
    // What each of the close two leads on, then every stock in order (the close two have nothing they'd need).
    const items = pick.close.flatMap((item) => item.reasons.map((reason) => ({ reason, who: item.symbol })));
    return (
      <section aria-label="Too close to call" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
        <header className="flex items-center gap-3 px-4 py-3">
          <span className="flex shrink-0">
            {pick.close.map((item) => (
              <span key={item.symbol} className="-ml-2 rounded-full ring-2 ring-oa-card first:ml-0">
                <StockLogo ticker={item.symbol} size={28} circle />
              </span>
            ))}
          </span>
          <div className="min-w-0">
            <h2 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg">{pick.title}</h2>
            {/* No pick here: the line under the title says what the card is instead (council, Nov 12). */}
            <p className="text-[13.5px] leading-5 text-oa-muted-fg">No clear pick between {pick.close.length === 2 ? "these two" : `these ${pick.close.length}`}</p>
          </div>
        </header>
        <ReasonGrid items={items} />
        <RunnerUps places={pick.ranking} hideScores={pick.callRuled} />
      </section>
    );
  }

  const top = pick.ranking[0]!;
  const name = names[top.symbol];
  // Two stocks: their two scores as one bar pair in the header (owner VISUALS CHECK: two numbers get a bar), so the
  // runner-up row does not print its score again.
  const second = pick.ranking.length === 2 && !pick.callRuled ? pick.ranking[1]! : null;
  return (
    <section aria-label="Our pick of these" className="oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card">
      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 hover:bg-oa-accent">
        <StockLogo ticker={top.symbol} size={32} />
        <div className="min-w-0 flex-1">
          <h2 className="text-balance text-[19px] font-semibold leading-6 tracking-[-0.01em] text-oa-fg">{pick.title}</h2>
          <p className="text-[13.5px] leading-5 text-oa-muted-fg">Our pick of these{name ? `: ${shortCompanyName(name)}` : ""}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-3 max-sm:basis-full max-sm:pl-11">
          <CallTag call={top.call} />
          {second ? (
            // Above the header's link so its hover title shows; the rest of the header still opens the stock.
            <span title="Our pick score of these, out of 100" className="relative z-[1] w-48 max-sm:flex-1">
              <VsBar value={top.score} versus={second.score} labels={[top.symbol, second.symbol]} suffix="/100" />
            </span>
          ) : (
            <Score place={top} hidden={pick.callRuled} />
          )}
        </span>
        <Link
          href={`/stock/${encodeURIComponent(top.symbol)}`}
          prefetch={false}
          aria-label={`${top.symbol}: our pick of these, open the stock`}
          className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      </header>
      <ReasonGrid items={pick.reasons.map((reason) => ({ reason }))} />
      {pick.loses ? (
        <p className="flex items-start gap-2 border-t border-oa-border px-4 py-2.5 text-[14px] leading-5 text-oa-fg">
          <ToneGlyph tone="down" className="mt-[5px] size-2.5" decorative />
          <span>
            <span className="text-oa-muted-fg">Where it loses: </span>
            {pick.loses}
          </span>
        </p>
      ) : null}
      <RunnerUps places={pick.ranking.slice(1)} hideScores={pick.callRuled || second !== null} />
    </section>
  );
}
