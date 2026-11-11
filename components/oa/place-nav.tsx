"use client";

import { IntentLink } from "@/components/oa/intent-link";
import { usePublicPathname } from "@/lib/use-public-pathname";
import * as React from "react";

import { iconFor, placeFor, sectionFor, stripOrder, trailFor, type Crumb, type NavItem } from "@/components/oa/nav-items";
import { NavIcon } from "@/components/oa/nav-icon";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * Below lg: the pages of the place you are in, under the top bar. The page
 * you are on comes first (filled), then as many of the next pages as fit
 * whole, then a plain "More" chip (no chevron) right after the last of them that opens every page of the place with
 * its icon. Pills never get cut off: a pill that does not fit wraps onto a
 * hidden second line. Places with one page get nothing.
 */
export function PlaceStrip() {
  const pathname = usePublicPathname() ?? "/";
  const place = placeFor(pathname);
  const current = sectionFor(pathname, place);
  const pills = place ? stripOrder(place, current) : [];
  const menuId = React.useId();
  const row = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  // How many pills sit on the visible line. Until it is measured, a guess from the label lengths, so the server's
  // HTML already leaves "More" out where every pill fits.
  const [shown, setShown] = React.useState(() => guessShown(pills));
  // The pill row's width once some pills do not fit: just the pills on its first line, so "More" follows the last
  // one instead of sitting at the far edge past a gap (owner rule 4). Null while every pill fits.
  const [rowWidth, setRowWidth] = React.useState<number | null>(null);
  const strip = React.useRef<HTMLElement>(null);
  // "More"'s width, kept from the last time it was drawn; a guess before then.
  const moreWidth = React.useRef(64);

  // Which pills fit, from the strip's own width (never the row's, which this sets): every pill when they all fit;
  // otherwise as many whole pills as fit beside "More". The rest wrap onto a second line the row's fixed height
  // hides, and leave the tab order too.
  const measure = React.useCallback(() => {
    const nav = strip.current;
    const container = row.current;
    if (!nav || !container) return;
    if (button.current) moreWidth.current = button.current.offsetWidth;
    const navStyle = getComputedStyle(nav);
    const rowStyle = getComputedStyle(container);
    const gap = parseFloat(rowStyle.columnGap) || 0;
    const inset = (parseFloat(rowStyle.paddingLeft) || 0) + (parseFloat(rowStyle.paddingRight) || 0);
    const available = nav.clientWidth - (parseFloat(navStyle.paddingLeft) || 0) - (parseFloat(navStyle.paddingRight) || 0);
    const widths = (Array.from(container.children) as HTMLElement[]).map((link) => link.offsetWidth);
    const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1) + inset;
    if (total <= available) {
      setShown((prev) => (prev === widths.length ? prev : widths.length));
      setRowWidth(null);
      return;
    }
    const room = available - moreWidth.current - (parseFloat(navStyle.columnGap) || 0) - inset;
    let used = 0;
    let fit = 0;
    for (const width of widths) {
      const next = used + (fit > 0 ? gap : 0) + width;
      if (next > room) break;
      used = next;
      fit += 1;
    }
    // The page you are on always shows, cut to the room there is if it must be.
    if (fit === 0) {
      fit = 1;
      used = Math.min(widths[0] ?? 0, Math.max(0, room));
    }
    setShown((prev) => (prev === fit ? prev : fit));
    // A pixel of slack, so rounding never pushes the last pill onto the hidden line.
    const width = Math.ceil(used + inset) + 1;
    setRowWidth((prev) => (prev === width ? prev : width));
  }, []);

  useIsoLayoutEffect(() => {
    const nav = strip.current;
    if (!nav) return;
    measure();
    let live = true;
    document.fonts?.ready.then(() => live && measure()).catch(() => undefined);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, [pathname, measure]);

  // A new page closes the menu (the chrome stays mounted while pages change underneath it).
  React.useEffect(() => setOpen(false), [pathname]);

  // Open: focus the page you are on (or the first), close on Escape or a tap anywhere else.
  React.useEffect(() => {
    if (!open) return;
    const links = panel.current?.querySelectorAll<HTMLAnchorElement>("a");
    const target = panel.current?.querySelector<HTMLAnchorElement>('[aria-current="page"], [aria-current="location"]') ?? links?.[0];
    target?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!panel.current?.contains(node) && !button.current?.contains(node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const everyPillFits = shown >= pills.length;
  // "More" just appeared: measure again with its real width rather than the guess.
  useIsoLayoutEffect(() => {
    if (!everyPillFits) measure();
  }, [everyPillFits, measure]);
  // The row grew (a phone turned sideways) until every pill fits: "More" goes, and its menu with it.
  React.useEffect(() => {
    if (everyPillFits) setOpen(false);
  }, [everyPillFits]);

  if (!place || place.sections.length < 2) return null;
  const menuOpen = open && !everyPillFits;
  return (
    <nav
      ref={strip}
      aria-label={place.label}
      className="oa-place-strip relative z-30 flex items-center gap-1.5 border-b border-oa-border bg-oa-page px-3 py-1.5 lg:hidden"
      // Tabbing out of the open menu closes it, the way a tap outside does. (A null target is a tap, which Safari
      // does not focus; the pointer handler deals with taps.)
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (menuOpen && next && !event.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <div
        ref={row}
        // Every pill in one line that scrolls sideways (no scrollbar), fading at the edge when some are past it, with
        // "More" right after: no measured gap, and nothing hidden (owner rule 4, Nov 11).
        className={`flex h-9 min-w-0 flex-1 flex-nowrap items-center gap-x-1.5 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          everyPillFits ? "" : "[mask-image:linear-gradient(to_right,black_82%,transparent)]"
        }`}
      >
        {pills.map((item, index) => {
          const on = item === current;
          const exact = on && pathname === item.href;
          const hidden = false;
          return (
            <IntentLink
              key={item.href}
              href={item.href}
              aria-current={on ? (exact ? "page" : "location") : undefined}
              tabIndex={hidden ? -1 : undefined}
              aria-hidden={hidden || undefined}
              className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[14px] transition-colors ${FOCUS} ${
                on
                  ? "border-transparent bg-oa-fg font-medium text-oa-page"
                  : "border-oa-border bg-oa-card text-oa-fg hover:bg-oa-accent"
              }`}
            >
              {item.label}
            </IntentLink>
          );
        })}
      </div>
      {everyPillFits ? null : (
        <button
          ref={button}
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
          className={`flex h-8 shrink-0 items-center rounded-full border px-3 text-[14px] font-medium transition-colors ${FOCUS} ${
            menuOpen ? "border-oa-fg bg-oa-accent text-oa-fg" : "border-oa-border bg-oa-card text-oa-fg hover:bg-oa-accent"
          }`}
        >
          {/* Plain words, no chevron (owner rule 1): the chip's pressed look says the menu is open. */}
          More<span className="sr-only"> pages in {place.label}</span>
        </button>
      )}
      {menuOpen ? (
        <div
          ref={panel}
          id={menuId}
          className="absolute inset-x-3 top-full mt-1.5 max-h-[calc(100dvh-11rem)] overflow-y-auto rounded-xl border border-oa-border bg-oa-card p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] [scrollbar-width:thin]"
        >
          <ul className="flex flex-col">
            {place.sections.map((item, index) => {
              const on = item === current;
              const heading = item.group && item.group !== place.sections[index - 1]?.group ? item.group : null;
              return (
                <li key={item.href}>
                  {heading ? <p className="select-none px-3 pb-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.1em] text-oa-muted-fg opacity-70 pt-3.5">{heading}</p> : null}
                  <IntentLink
                    href={item.href}
                    aria-current={on ? (pathname === item.href ? "page" : "location") : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors ${FOCUS} ${
                      on
                        ? "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] font-medium text-oa-fg"
                        : "text-oa-fg hover:bg-oa-accent"
                    }`}
                  >
                    <NavIcon name={item.icon} className={`size-[18px] shrink-0 ${on ? "text-oa-primary" : "text-oa-muted-fg"}`} />
                    {item.label}
                  </IntentLink>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * The server's guess at how many pills fit a 390px phone beside "More": 14px text runs about 7.6px a letter, a pill
 * adds 24px of padding and border, the gap 6px. The browser measures the real number before it paints.
 */
function guessShown(pills: NavItem[]): number {
  const pill = (item: NavItem) => item.label.length * 7.6 + 26 + 6;
  const room = 390 - 24 - 4;
  const all = pills.reduce((sum, item) => sum + pill(item), 0);
  if (all <= room) return pills.length;
  let used = 64; // the "More" chip
  let count = 0;
  for (const item of pills) {
    used += pill(item);
    if (used > room) break;
    count += 1;
  }
  return Math.max(1, count);
}

function TrailLinks({ trail }: { trail: Crumb[] }) {
  return (
    <>
      {trail.map((crumb, index) => (
        <React.Fragment key={crumb.href + index}>
          {index > 0 ? (
            <span aria-hidden="true" className="text-oa-muted-fg">
              ›
            </span>
          ) : null}
          <IntentLink href={crumb.href} className={`rounded ${FOCUS}`}>
            {crumb.label}
          </IntentLink>
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * The way back above a page title. Inside the app's places it is worked out
 * from the address, so every deep page says it the same way ("Research ›
 * NVDA", "Follow investors › Funds and Congress"); `tail` adds links the
 * address cannot know (a stock's sector). Outside the places (docs, the 404
 * page) the page's own `crumb` is shown as it is.
 */
export function PlaceTrail({
  crumb,
  tail = [],
  className = "",
}: {
  crumb?: React.ReactNode;
  tail?: Crumb[];
  className?: string;
}) {
  const pathname = usePublicPathname() ?? "/";
  const trail = trailFor(pathname);
  const links = trail ? [...trail, ...tail] : null;
  const body = links ? (links.length ? <TrailLinks trail={links} /> : null) : crumb;
  if (body == null || body === false) return null;
  return (
    <nav
      aria-label="You are here"
      className={`mb-1 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-5 text-oa-muted-fg [&_a:hover]:text-oa-fg [&_a]:underline [&_a]:decoration-oa-border [&_a]:underline-offset-2 ${className}`}
    >
      {body}
    </nav>
  );
}

/** The small icon beside a page title: the same one the menu and the Market today list use for this place. */
export function PageIcon({ className = "" }: { className?: string }) {
  const pathname = usePublicPathname() ?? "/";
  const icon = iconFor(pathname);
  if (!icon) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-oa-border bg-oa-card text-oa-primary sm:size-9 ${className}`}
    >
      <NavIcon name={icon} className="size-[18px] sm:size-5" />
    </span>
  );
}
