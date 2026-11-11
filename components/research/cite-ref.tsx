"use client";

import * as React from "react";

/**
 * One numbered citation in a research report. Tapping or clicking the number (or Enter on it) opens a small
 * card at the claim with the source's name, its date and a link, so the reader checks it without leaving the
 * page; a mouse hovering the number opens it too. Escape, a tap elsewhere or moving focus away closes it.
 * Only one card is open at a time. On a wide screen the card is fixed to the viewport and placed under the
 * number (above it when there is no room), so a section's edges never cut it off. On a phone it is a short sheet
 * along the bottom, above the tab bar, and the page scrolls just enough to keep the cited sentence in view
 * above it; focus moves into the sheet and comes back to the number when it closes.
 */

const OPEN_EVENT = "research-cite-open";
/** Below this width the card becomes a bottom sheet. */
const SHEET_QUERY = "(max-width: 639.98px)";

export type CiteRefProps = {
  /** The number shown, "3". */
  n: string;
  label: string;
  /** What kind of source, in words: "News", "Filing". */
  kind: string | null;
  /** "Nov 2, 2026", or null when the source has no date. */
  date: string | null;
  url: string | null;
};

/** Where the card sits: at the number (a popover), or along the bottom above the tab bar (a sheet). */
type Place = { top: number; left: number } | { bottom: number };

export function CiteRef({ n, label, kind, date, url }: CiteRefProps) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [place, setPlace] = React.useState<Place | null>(null);
  const [sheet, setSheet] = React.useState(false);
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const cardRef = React.useRef<HTMLSpanElement>(null);
  // Opened by a hover (closes when the mouse leaves) or pinned by a click, tap or key (stays until dismissed).
  const pinned = React.useRef(false);
  const hoverTimer = React.useRef<number | undefined>(undefined);
  const external = Boolean(url && /^https?:/.test(url));

  const show = React.useCallback((pin: boolean) => {
    pinned.current = pin;
    setSheet(window.matchMedia(SHEET_QUERY).matches);
    setOpen(true);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
  }, [id]);
  const hide = React.useCallback(() => {
    pinned.current = false;
    setOpen(false);
    setPlace(null);
  }, []);

  // Another citation opened: this one closes.
  React.useEffect(() => {
    const onOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) hide();
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [id, hide]);

  React.useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  // Place the card under the number, inside the viewport and above the phone tab bar; follow it on scroll.
  React.useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const button = buttonRef.current;
      const card = cardRef.current;
      if (!button || !card) return;
      const floor = tabBarTop() - 8;
      if (sheet) {
        const bottom = Math.round(window.innerHeight - floor);
        setPlace((prev) => (prev && "bottom" in prev && prev.bottom === bottom ? prev : { bottom }));
        return;
      }
      const at = button.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      let top = at.bottom + 6;
      if (top + height > floor && at.top - 6 - height >= 8) top = at.top - 6 - height;
      const left = Math.max(8, Math.min(at.left - 12, window.innerWidth - width - 8));
      setPlace({ top: Math.round(top), left: Math.round(left) });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [open, sheet]);

  // A sheet, once placed: scroll the page so the number (the end of the cited sentence) sits clear above the
  // sheet, then move focus into it for keyboards and screen readers.
  React.useEffect(() => {
    if (!open || !sheet || !place) return;
    const button = buttonRef.current;
    const card = cardRef.current;
    if (!button || !card) return;
    const at = button.getBoundingClientRect();
    const sheetTop = card.getBoundingClientRect().top;
    const gap = 40;
    if (at.bottom > sheetTop - gap) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: at.bottom - sheetTop + gap, behavior: still ? "auto" : "smooth" });
    }
    if (pinned.current) card.focus({ preventScroll: true });
    // Once per opening: `place` only changes again when the window resizes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet, place !== null]);

  // While open: Escape closes and returns focus to the number; a tap or click outside closes.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Focus goes back to the number only when the card was opened from it, not by a passing mouse.
      const wasPinned = pinned.current;
      hide();
      if (wasPinned) buttonRef.current?.focus();
    };
    const onDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) hide();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, hide]);

  const hoverIn = (event: React.PointerEvent) => {
    // A hover never opens the phone's sheet: it would cover the page under a passing mouse.
    if (event.pointerType !== "mouse" || window.matchMedia(SHEET_QUERY).matches) return;
    window.clearTimeout(hoverTimer.current);
    if (!open) hoverTimer.current = window.setTimeout(() => show(false), 120);
  };
  const hoverOut = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    // A short grace so the mouse can cross from the number to the card's link.
    if (open && !pinned.current) hoverTimer.current = window.setTimeout(hide, 180);
  };

  const meta = [kind, date].filter(Boolean).join(" · ");
  return (
    <span
      ref={wrapRef}
      className="relative"
      onPointerEnter={hoverIn}
      onPointerLeave={hoverOut}
      onBlur={(event) => {
        // Only when focus moves somewhere else (Tab); a click on the card's text blurs to nothing and keeps it open.
        const next = event.relatedTarget as Node | null;
        if (open && next && !wrapRef.current?.contains(next)) hide();
      }}
    >
      <sup className="ml-px">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={`Source ${n}: ${label}${date ? `, ${date}` : ""}`}
          onClick={() => {
            window.clearTimeout(hoverTimer.current);
            // A click on a card the hover opened keeps it open (pinned) rather than closing it.
            if (open && pinned.current) hide();
            else show(true);
          }}
          // The number stays small; an invisible pad around it makes it big enough to tap on a phone.
          className={`oa-mono relative rounded px-[1px] text-[10.5px] font-medium leading-none text-oa-primary outline-none after:absolute after:-inset-x-1 after:-inset-y-2 after:content-[''] hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-oa-primary ${
            open ? "bg-oa-accent" : ""
          }`}
        >
          {n}
        </button>
      </sup>
      {open ? (
        <span
          ref={cardRef}
          id={id}
          role={sheet ? "dialog" : "group"}
          aria-label={`Source ${n}`}
          tabIndex={sheet ? -1 : undefined}
          style={place ? ("bottom" in place ? { bottom: place.bottom } : { top: place.top, left: place.left }) : { top: 0, left: 0 }}
          className={`fixed z-[60] flex flex-col gap-1 whitespace-normal border border-oa-border bg-oa-card text-left font-normal tracking-normal outline-none ${
            sheet
              ? "inset-x-2 rounded-xl py-3 pl-4 pr-12 shadow-[0_-8px_28px_-10px_rgba(0,0,0,0.3)]"
              : "w-[min(20rem,calc(100vw-16px))] rounded-lg px-3 py-2.5 shadow-lg"
          } ${place ? "" : "invisible"}`}
        >
          {sheet ? (
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                hide();
                buttonRef.current?.focus({ preventScroll: true });
              }}
              className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-lg text-oa-muted-fg outline-none hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-oa-primary"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          ) : null}
          <span className="block text-pretty text-[13.5px] font-medium leading-5 text-oa-fg">{label}</span>
          {meta ? <span className="oa-mono block text-[12px] leading-4 text-oa-muted-fg">{meta}</span> : null}
          {url ? (
            <a
              href={url}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="mt-0.5 self-start text-[13px] font-medium leading-5 text-oa-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {external ? "Open the source ↗" : "Open the page →"}
            </a>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** The top of the phone tab bar, or the bottom of the window where there is none (lg and up). */
function tabBarTop(): number {
  const nav = document.querySelector<HTMLElement>(".oa-mobile-nav");
  // The tab bar is fixed (so offsetParent is always null); it counts when it is shown, below lg.
  const top = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : window.innerHeight;
  return Math.min(window.innerHeight, top);
}
