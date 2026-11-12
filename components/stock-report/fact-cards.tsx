import { Fragment, type CSSProperties } from "react";
import type { EvidenceBar, EvidenceLine } from "@/lib/call-evidence";
import { barGeometry } from "./fact-bars";
import { TONE_COLOR } from "./primitives";

/**
 * What the call rests on, as fact cards in a row (owner, Nov 12, on the bullets above the checks: "It looks completely
 * fucked up. It's a very big issue for me"). Each card is one big figure, a label of a few words, at most one line, and
 * a pair of bars where the fact compares two numbers (the stock against the S&P 500, now against before). The cards
 * come from the evidence's structured fields (lib/call-evidence.ts `EvidenceCard`), never from its sentences; the
 * source sits in the card's hover title, not under it (owner rule 4).
 *
 * Equal columns that fill the row (one per card, at most three), equal heights; on a phone, one card per row. A card
 * wide enough sets its bars beside the figure instead of under it, so two cards across a wide strip stay short.
 */

/** Columns at the row's own width: one per card up to three, all on one line once the row has room. */
function rowStyle(count: number): CSSProperties {
  return { ["--n" as string]: Math.min(Math.max(count, 1), 3) };
}
// Cards in one row are the same height (the grid stretches them); the row itself keeps its natural height, so a card
// is never padded out to a taller neighbouring column (council, Nov 12).
const ROW =
  "grid grid-cols-1 gap-3 [@container(min-width:30rem)]:grid-cols-[repeat(var(--n),minmax(0,1fr))]";
const CARD = "min-w-0 rounded-lg border border-oa-border bg-oa-bg px-3 py-2.5 [container-type:inline-size]";

/**
 * Two numbers as signed bars from one zero line on one shared scale (./fact-bars.ts): a fall runs left of zero, a rise
 * right (council, Nov 12: −13% and −0.9% must not point the same way as a gain). A change is drawn in the up tone
 * right of zero and the down tone left of it; a level (a price, a P/E, EPS) in ink. The second bar, the one the stock
 * is set against, is lighter. A bar whose value is the card's big figure prints no number: the figure already says it
 * (council, Nov 12: "+83%" twice), so only the comparison's own value is written.
 */
function Bars({ pair, kind, figure }: { pair: readonly [EvidenceBar, EvidenceBar]; kind: "change" | "level"; figure: string }) {
  const { zero, bars } = barGeometry(pair.map((bar) => bar.value));
  // The zero line is drawn only when something runs left of it; otherwise it is the track's own left edge.
  const showZero = zero > 0;
  return (
    <div className="grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-x-2 gap-y-1 text-[12px] leading-4">
      {pair.map((bar, index) => {
        const shape = bars[index]!;
        const background = kind === "change" ? (shape.negative ? TONE_COLOR.down : TONE_COLOR.up) : index ? "var(--oa-muted-fg)" : "var(--oa-fg)";
        return (
          <Fragment key={bar.label}>
            <span className="truncate text-oa-muted-fg">{bar.label}</span>
            <span aria-hidden="true" className="relative h-1.5 rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_7%,transparent)]">
              <span className="absolute inset-y-0 rounded-full" style={{ left: `${shape.left}%`, width: `${shape.width}%`, background, opacity: index ? 0.5 : 1 }} />
              {/* A value too small to see as a bar gets a dot at its end, at its true position (no padded width). */}
              {shape.tiny ? (
                <span
                  className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${shape.negative ? shape.left : shape.left + shape.width}%`, background, opacity: index ? 0.5 : 1 }}
                />
              ) : null}
              {showZero ? <span className="absolute -inset-y-0.5 w-px bg-oa-muted-fg" style={{ left: `${zero}%` }} /> : null}
            </span>
            <span className="oa-mono text-right font-medium text-oa-fg">{bar.display === figure ? "" : bar.display}</span>
          </Fragment>
        );
      })}
    </div>
  );
}

export function FactCards({ lines, label }: { lines: ReadonlyArray<EvidenceLine>; label: string }) {
  // Every line built by lib/call-evidence.ts has its card; anything without one is left out, never shown as a sentence.
  const cards = lines.filter((line) => Boolean(line.card));
  if (!cards.length) return null;
  return (
    <div className="[container-type:inline-size]">
      <ul role="list" aria-label={label} className={ROW} style={rowStyle(cards.length)}>
        {cards.map((line) => {
          const card = line.card;
          const color = card.tone ? TONE_COLOR[card.tone] : "var(--oa-fg)";
          return (
            // The full sentence stays readable to a screen reader; the source is the hover title.
            <li key={line.id} className={CARD} title={line.source} aria-label={line.text}>
              <div aria-hidden="true" className="flex h-full flex-col gap-2 [@container(min-width:24rem)]:grid [@container(min-width:24rem)]:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] [@container(min-width:24rem)]:items-center [@container(min-width:24rem)]:gap-x-5">
                <div className="min-w-0">
                  <p className="oa-mono text-[24px] font-semibold leading-7 tracking-[-0.01em]" style={{ color }}>
                    {card.figure}
                  </p>
                  <p className="text-[13px] leading-[18px] text-oa-muted-fg">{card.label}</p>
                  {card.line ? <p className="mt-1.5 text-pretty text-[13.5px] leading-5 text-oa-fg">{card.line}</p> : null}
                </div>
                {card.compare ? (
                  <div className="mt-auto min-w-0 [@container(min-width:24rem)]:mt-0">
                    <Bars pair={card.compare} kind={card.compareKind ?? "level"} figure={card.figure} />
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
