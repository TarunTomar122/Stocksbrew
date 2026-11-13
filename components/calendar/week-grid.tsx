"use client";

import * as React from "react";

import { levelColumns, type ColumnMeasure } from "@/components/calendar/level";

// The kit's focus ring, written out: the kit's index pulls in server-only modules a client file cannot import.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
/** Matches the grid's gap-2 and a card's pb-2, in px. */
const GAP = 8;
const PAD = 8;
/** The "Show N more" line at lg (lg:min-h-8). While measuring every block shows, so there is rarely one to measure. */
const BUTTON = 32;

/** A layout effect in the browser; on the server (where it would only warn) a plain effect that never runs. */
const useBrowserLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export type WeekBlock = { key: string; node: React.ReactNode; row: boolean };
export type WeekCard = {
  day: string;
  /** The card's own classes (background, phone order). */
  className: string;
  label: string;
  /** The day's header link, rendered on the server. */
  head: React.ReactNode;
  blocks: WeekBlock[];
  /** How many blocks the server shows before its "Show N more" (fold-day.ts foldDay): the no-JS and phone fold. */
  ssrCut: number;
};
export type WeekColumn = { key: string; cards: WeekCard[] };

/**
 * The week's day cards side by side. The server folds each day on estimated heights; from lg up this measures the
 * real ones after layout (and again when the width changes) and folds every column to one height, with "Show N more"
 * at the bottom of each card, so the cards end level at any width (owner rule 4): busy days fold to the height, and a
 * quiet day with nothing left to show stretches to it (level.ts). A sparse week (`level` false: no day needs folding)
 * is not leveled, each card as high as what it holds. A phone keeps the server's fold.
 */
export function WeekGrid({ columns, template, level: leveled = true }: { columns: WeekColumn[]; template: string; level?: boolean }) {
  const grid = React.useRef<HTMLDivElement>(null);
  // null: the server's cuts. Set from lg up once measured.
  const [measuredLevel, setLevel] = React.useState<{ target: number; cuts: number[][]; columns: WeekColumn[] } | null>(null);
  // Cuts measured for other columns (new data on the same page) are not used, even for the frame before re-measuring.
  const level = measuredLevel?.columns === columns ? measuredLevel : null;
  const [measuring, setMeasuring] = React.useState(false);
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => new Set());

  // Measure with every block laid out, before the browser paints: no flash of the unfolded week.
  useBrowserLayoutEffect(() => {
    if (!measuring || !grid.current) return;
    const button = grid.current.querySelector<HTMLElement>("[data-fold-button]")?.offsetHeight || BUTTON;
    const measured: ColumnMeasure[] = columns.map((column) => ({
      cards: column.cards.map((card) => {
        const section = grid.current!.querySelector<HTMLElement>(`[data-day="${card.day}"]`);
        const items = Array.from(section?.querySelectorAll<HTMLElement>("[data-block]") ?? []).map((element, index) => ({
          height: element.offsetHeight,
          row: card.blocks[index]?.row ?? false,
        }));
        // Everything but the blocks and the padding under them: the header and the card's borders. While measuring
        // every block shows, so no "Show N more" line is there to count (an open card's is subtracted too).
        const open = section?.querySelector<HTMLElement>("[data-fold-button]")?.offsetHeight ?? 0;
        const head = (section?.offsetHeight ?? 0) - items.reduce((sum, item) => sum + item.height, 0) - PAD - open;
        return { head, items, ssrCut: card.ssrCut };
      }),
    }));
    setLevel({ ...levelColumns(measured, { gap: GAP, button, pad: PAD }), columns });
    setMeasuring(false);
  }, [measuring, columns]);

  React.useEffect(() => {
    const element = grid.current;
    if (!element) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const run = () => {
      // A sparse week is not leveled: each card stays as high as what it holds.
      if (wide.matches && leveled) setMeasuring(true);
      else setLevel(null);
    };
    run();
    let width = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth === width) return;
      width = element.offsetWidth;
      run();
    });
    observer.observe(element);
    wide.addEventListener("change", run);
    // A late web font changes every line's height.
    void document.fonts?.ready.then(run);
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", run);
    };
  }, [columns, leveled]);

  const toggle = (day: string, button: HTMLElement) => {
    const closing = open.has(day);
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
    // Folding a long day back up from far down the page would leave the reader below the card: bring its button back.
    if (closing) requestAnimationFrame(() => {
      if (button.getBoundingClientRect().top < 0) button.scrollIntoView({ block: "center" });
    });
  };

  return (
    // Columns start at the top; a measured column holds one height (min-height) and its last card fills it, so a card
    // opened with "Show N more" grows alone instead of stretching the others.
    <div ref={grid} className="flex flex-col gap-2 lg:grid lg:items-start lg:[grid-template-columns:var(--cal-cols)]" style={{ "--cal-cols": template } as React.CSSProperties}>
      {columns.map((column, columnIndex) => (
        <div
          key={column.key}
          // On a phone the column dissolves (`contents`), so the days order themselves: today, the days to come, then the ones past.
          className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-2"
          style={level && !measuring ? { minHeight: level.target } : undefined}
        >
          {column.cards.map((card, cardIndex) => {
            const cut = measuring || open.has(card.day) ? card.blocks.length : (level?.cuts[columnIndex]?.[cardIndex] ?? card.ssrCut);
            const folded = card.ssrCut < card.blocks.length || (level?.cuts[columnIndex]?.[cardIndex] ?? card.blocks.length) < card.blocks.length;
            const hiddenRows = card.blocks.slice(cut).filter((block) => block.row).length;
            const last = cardIndex === column.cards.length - 1;
            const id = `fold-${card.day}`;
            return (
              <section
                key={card.day}
                id={`d-${card.day}`}
                data-day={card.day}
                aria-label={card.label}
                className={`oa-surface flex min-w-0 scroll-mt-16 flex-col overflow-hidden border border-oa-border lg:order-none ${last ? "lg:flex-1" : ""} ${card.className}`}
              >
                {card.head}
                <div id={id} className={hiddenRows ? "" : "pb-2"}>
                  {card.blocks.map((block, index) => (
                    <div key={block.key} data-block="" hidden={index >= cut}>
                      {block.node}
                    </div>
                  ))}
                </div>
                {folded && (hiddenRows > 0 || open.has(card.day)) ? (
                  <button
                    type="button"
                    data-fold-button=""
                    aria-expanded={open.has(card.day)}
                    aria-label={`${open.has(card.day) ? "Show less" : `Show ${hiddenRows} more`} for ${card.label}`}
                    aria-controls={id}
                    onClick={(event) => toggle(card.day, event.currentTarget)}
                    className={`mt-auto flex min-h-10 w-full cursor-pointer items-center px-3 text-left text-[13.5px] font-medium text-oa-primary hover:underline lg:min-h-8 ${FOCUS}`}
                  >
                    {open.has(card.day) ? "Show less" : `Show ${hiddenRows} more`}
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}
