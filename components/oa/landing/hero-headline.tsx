"use client";

import * as React from "react";

import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";

/**
 * The landing's headline in three lines (owner, Nov 15): "Know exactly / what to do with each / stock you own".
 * Two spots open a small picture card on hover, focus or tap (owner: a visual, a short title, almost no text): "what
 * to do" (the three calls) and "own" (tracking your stocks against the S&P 500). The "?" after Know is gone (owner,
 * Nov 18). Three logos before "stock" open their stock pages.
 *
 * The cards are rendered only while open, so the heading's text (and what a search engine reads) is the sentence alone.
 * Each opens under its own word, moved in only as far as the screen edge needs.
 */

const LOGOS = ["AAPL", "NVDA", "MSFT"] as const;

/** The headline's words as drawn, in order; joined with spaces they are HERO_HEADLINE (tested). */
export const HEADLINE_PIECES = ["Know", "exactly", "what to do", "with each", "stock you", "own"] as const;
const [KNOW, EXACTLY, WHAT_TO_DO, WITH_EACH, STOCK_YOU, OWN] = HEADLINE_PIECES;

/** Small pictures for the cards: shapes only, no prices or returns, so nothing in them can be out of date or untrue. */
const toPoints = (ys: number[]) => ys.map((y, i) => `${(i * 240) / (ys.length - 1)},${y}`).join(" ");

// "own" card: your stocks and the S&P 500 start and finish at the same point and cross on the way, so the picture never
// says either one wins (a schematic, not a return).
const MINE_LINE = toPoints([36, 28, 40, 26, 42, 30, 44, 32, 36]);
const MINE_AREA = `${MINE_LINE} 240,64 0,64`;
const SP_LINE = toPoints([36, 38, 34, 37, 33, 38, 35, 37, 36]);

/** Plus, equals, minus: adding to, keeping or trimming what you own. Not arrows, which read as a price forecast. */
const CALL_TILES = [
  { call: "Buy more", glyph: "+", tile: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300" },
  { call: "Keep", glyph: "=", tile: "border border-oa-border bg-oa-accent text-oa-fg" },
  { call: "Sell some", glyph: "\u2212", tile: "bg-amber-500/15 text-amber-900 dark:text-amber-300" },
] as const;

const PORTFOLIO_LOGOS = LOGOS;

type HintKey = "calls" | "own";

/** Card width in px (17rem); it opens under the word it explains, moved in only as far as the screen edge needs. */
const PANEL_WIDTH = 272;
// No links inside: taps and clicks pass through to the words under it (a card can cover the next line on a phone).
const PANEL =
  "hh-rise pointer-events-none absolute z-30 w-[17rem] max-w-[calc(100vw-2rem)] rounded-xl border border-oa-border bg-oa-card p-3.5 text-left text-[14px] font-normal leading-5 tracking-normal text-oa-fg shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]";
const PANEL_TITLE = "block text-[14px] font-medium leading-5";

export function HeroHeadline({ lead, emphasis }: { lead: string; emphasis: string }) {
  const [open, setOpen] = React.useState<HintKey | null>(null);
  const [place, setPlace] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  // How the open card was opened. A tap fires focus (and on some phones a hover) before its click; a mouse click
  // follows a hover. That click must keep the card open, and only a click on a card a click opened closes it.
  const openedBy = React.useRef<"hover" | "focus" | "click" | null>(null);
  const id = React.useId();

  /**
   * Opens `key`'s card where the pointer is (owner: "the card should be where the pointer is"): centred on it, just
   * under it. From the keyboard there is no pointer, so it opens under the word's middle. Kept 16px inside the screen.
   */
  const openAt = (key: HintKey, word: HTMLElement, pointer?: { x: number; y: number }) => {
    const heading = headingRef.current;
    if (heading) {
      const box = heading.getBoundingClientRect();
      const target = word.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 32);
      const x = pointer ? pointer.x : target.left + target.width / 2;
      const left = Math.min(Math.max(x - width / 2, 16), window.innerWidth - 16 - width);
      const top = pointer ? Math.max(pointer.y + 18, target.bottom + 6) : target.bottom + 10;
      setPlace({ left: left - box.left, top: top - box.top });
    }
    setOpen(key);
  };

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    // A card left open would float over the page as it scrolls (and on iOS a button may never blur).
    const onScroll = () => setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  /** A mouse hover, keyboard focus and a tap all open it; leaving, blurring or a second tap or click closes it. */
  const trigger = (key: HintKey, label: string) => ({
    "aria-label": label,
    "aria-expanded": open === key,
    "aria-controls": open === key ? `${id}-${key}` : undefined,
    // Hover only for a real mouse: a phone's emulated hover would open it just before the tap's click.
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      openedBy.current = "hover";
      openAt(key, event.currentTarget, { x: event.clientX, y: event.clientY });
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse" || openedBy.current === "click") return;
      setOpen((current) => (current === key ? null : current));
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (open === key) return;
      openedBy.current = "focus";
      openAt(key, event.currentTarget);
    },
    onBlur: () => setOpen((current) => (current === key ? null : current)),
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      const pointer = event.detail ? { x: event.clientX, y: event.clientY } : undefined;
      if (open === key && openedBy.current === "click") {
        openedBy.current = null;
        setOpen(null);
        return;
      }
      const before = open === key ? openedBy.current : null;
      openedBy.current = "click";
      // Opened by hover already: keep it where it is. Opened by a tap's focus: move it to where the finger landed.
      if (open !== key || (pointer && before !== "hover")) openAt(key, event.currentTarget, pointer);
    },
  });

  return (
    // Screen readers hear the plain sentence as the heading's name; the three buttons inside keep their own labels.
    <h1
      ref={headingRef}
      aria-label={`${lead} ${emphasis}`}
      className="relative mx-auto max-w-[52rem] text-center font-medium tracking-[-0.03em] text-oa-fg text-[2.1rem] leading-[1.18] sm:text-[3.25rem] sm:leading-[1.1] xl:text-[4.25rem] xl:leading-[1.06]"
    >
      <span className="block">
        {KNOW} {EXACTLY}
      </span>{" "}
      <span className="block">
        <button
          type="button"
          {...trigger("calls", "The three calls")}
          className="rounded-sm font-medium tracking-tight underline decoration-oa-primary/50 decoration-dotted decoration-[0.06em] underline-offset-[0.14em] outline-none transition-colors hover:decoration-oa-primary focus-visible:ring-2 focus-visible:ring-oa-fg/20"
        >
          {WHAT_TO_DO}
        </button>{" "}
        <span className="text-oa-muted-fg">{WITH_EACH}</span>
      </span>{" "}
      <span className="block text-oa-muted-fg">
        {/* Three logos, overlapping, each opening its stock page. Each box is sized in the headline's em and the logo fills
            it (its own inline size is in px). The one under the pointer lifts in place (owner: nothing on the line moves). */}
        <span className="mr-[0.2em] inline-flex items-center align-[-0.08em]">
          {LOGOS.map((ticker, index) => (
            <Link
              key={ticker}
              prefetch={false}
              href={`/stock/${ticker}`}
              aria-label={`${ticker} stock page`}
              className={`relative inline-flex size-[0.8em] shrink-0 overflow-hidden rounded-full ring-[0.05em] ring-[var(--oa-page)] outline-none transition-transform duration-200 ease-out hover:z-10 hover:-translate-y-[0.08em] hover:scale-110 focus-visible:z-10 focus-visible:ring-oa-fg/40 motion-reduce:transition-none [&>*]:!size-full ${
                index ? "-ml-[0.24em]" : ""
              }`}
            >
              <StockLogo ticker={ticker} size={64} circle eager />
            </Link>
          ))}
        </span>
        {STOCK_YOU}{" "}
        <button
          type="button"
          {...trigger("own", "Track your portfolio")}
          className="inline-flex items-baseline gap-[0.12em] rounded-sm text-oa-muted-fg outline-none transition-colors hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-oa-fg/20"
        >
          {OWN}
          {/* A briefcase: the stocks you hold. */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[0.62em] self-center text-oa-primary">
            <rect x="3" y="7" width="18" height="13" rx="2.5" />
            <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
            <path d="M3 12.5h18" />
          </svg>
        </button>
      </span>

      {open === "calls" ? (
        <span id={`${id}-calls`} role="tooltip" className={PANEL} style={place}>
          <span className={PANEL_TITLE}>Three calls</span>
          {/* Three tiles, one after another: add, keep, trim. Not a chart, so it reads apart from the "own" card. */}
          <span className="mt-2.5 grid grid-cols-3 gap-2">
            {CALL_TILES.map((tile, index) => (
              <span
                key={tile.call}
                className={`hh-rise flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 ${tile.tile}`}
                style={{ animationDelay: `${60 + index * 50}ms` }}
              >
                <span className="text-[24px] font-semibold leading-7">{tile.glyph}</span>
                <span className="whitespace-nowrap text-[12.5px] font-medium leading-4">{tile.call}</span>
              </span>
            ))}
          </span>
        </span>
      ) : null}

      {open === "own" ? (
        <span id={`${id}-own`} role="tooltip" className={PANEL} style={place}>
          <span className={PANEL_TITLE}>Track your portfolio</span>
          {/* Your stocks (a copper area) against the S&P 500 (dashed): same start, same finish, crossing between. */}
          <svg viewBox="0 0 240 64" aria-hidden="true" className="mt-2.5 block h-16 w-full overflow-visible">
            <polygon points={MINE_AREA} className="hh-fade fill-oa-primary/10" style={{ animationDelay: "240ms" }} />
            <polyline points={SP_LINE} fill="none" strokeWidth="1.75" strokeDasharray="4 4" strokeLinecap="round" className="hh-fade stroke-oa-muted-fg" />
            <polyline points={MINE_LINE} pathLength={1} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="hh-draw stroke-oa-primary" />
          </svg>
          <span className="mt-2.5 flex items-center gap-4 text-[12.5px] leading-4 text-oa-muted-fg">
            <span className="flex items-center gap-1.5">
              {/* The headline's three logos stand for "your stocks". */}
              <span className="flex items-center">
                {PORTFOLIO_LOGOS.map((ticker, index) => (
                  <span key={ticker} className={`inline-flex size-4 overflow-hidden rounded-full ring-1 ring-oa-card [&>*]:!size-full ${index ? "-ml-1.5" : ""}`}>
                    <StockLogo ticker={ticker} size={16} circle />
                  </span>
                ))}
              </span>
              <span className="text-oa-primary">Your stocks</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-oa-muted-fg" />
              S&amp;P 500
            </span>
          </span>
        </span>
      ) : null}
    </h1>
  );
}
