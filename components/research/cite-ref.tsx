"use client";

import * as React from "react";

/**
 * One numbered citation in a research report. Tapping or clicking the number (or Enter on it) opens a small
 * card at the claim with the source's name, its date and a link, so the reader checks it without leaving the
 * page; a mouse hovering the number opens it too. Escape, a tap elsewhere or moving focus away closes it.
 * Only one card is open at a time. The card is fixed to the viewport and placed under the number (above it
 * when there is no room, clear of the phone tab bar), so a section's edges never cut it off.
 */

const OPEN_EVENT = "research-cite-open";

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

type Place = { top: number; left: number };

export function CiteRef({ n, label, kind, date, url }: CiteRefProps) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [place, setPlace] = React.useState<Place | null>(null);
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const cardRef = React.useRef<HTMLSpanElement>(null);
  // Opened by a hover (closes when the mouse leaves) or pinned by a click, tap or key (stays until dismissed).
  const pinned = React.useRef(false);
  const hoverTimer = React.useRef<number | undefined>(undefined);
  const external = Boolean(url && /^https?:/.test(url));

  const show = React.useCallback((pin: boolean) => {
    pinned.current = pin;
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
      const at = button.getBoundingClientRect();
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const nav = document.querySelector<HTMLElement>(".oa-mobile-nav");
      // The tab bar is fixed (so offsetParent is always null); it counts when it is shown, below lg.
      const navTop = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : window.innerHeight;
      const floor = Math.min(window.innerHeight, navTop) - 8;
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
  }, [open]);

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
    if (event.pointerType !== "mouse") return;
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
          role="group"
          aria-label={`Source ${n}`}
          style={place ? { top: place.top, left: place.left } : { top: 0, left: 0 }}
          className={`fixed z-[60] rounded-lg flex w-[min(20rem,calc(100vw-16px))] flex-col gap-1 whitespace-normal font-normal tracking-normal border border-oa-border bg-oa-card px-3 py-2.5 text-left shadow-lg ${
            place ? "" : "invisible"
          }`}
        >
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
