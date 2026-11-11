"use client";

import { IntentLink } from "@/components/oa/intent-link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { iconFor, placeFor, sectionFor, trailFor, type Crumb } from "@/components/oa/nav-items";
import { NavIcon } from "@/components/oa/nav-icon";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * Below lg: the pages of the place you are in, as a row of chips under the
 * top bar, with the current one filled. The tab bar says the place; this
 * says the page and shows its neighbours. Places with one page get nothing.
 */
export function PlaceStrip() {
  const pathname = usePathname() ?? "/";
  const place = placeFor(pathname);
  const current = sectionFor(pathname, place);
  const row = React.useRef<HTMLDivElement>(null);
  // Which edges have chips hidden past them, so the row can say there are more.
  const [more, setMore] = React.useState({ left: false, right: false });

  const measure = React.useCallback(() => {
    const container = row.current;
    if (!container) return;
    const left = container.scrollLeft > 4;
    const right = container.scrollLeft + container.clientWidth < container.scrollWidth - 4;
    setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Centre the current chip inside the row without moving the page: before paint, and again once the web font
  // has loaded and the chips have their real widths.
  useIsoLayoutEffect(() => {
    const container = row.current;
    if (!container) return;
    const centre = () => {
      const chip = container.querySelector<HTMLElement>('[aria-current="page"], [aria-current="location"]');
      if (chip) {
        const target = chip.offsetLeft - container.offsetLeft - (container.clientWidth - chip.offsetWidth) / 2;
        container.scrollLeft = Math.max(0, Math.min(target, container.scrollWidth - container.clientWidth));
      }
      measure();
    };
    centre();
    let live = true;
    document.fonts?.ready.then(() => live && centre()).catch(() => undefined);
    window.addEventListener("resize", measure);
    return () => {
      live = false;
      window.removeEventListener("resize", measure);
    };
  }, [pathname, measure]);

  const nudge = (direction: 1 | -1) => {
    const container = row.current;
    container?.scrollBy({ left: direction * container.clientWidth * 0.6, behavior: "smooth" });
  };

  if (!place || place.sections.length < 2) return null;
  return (
    <nav aria-label={place.label} className="oa-place-strip relative border-b border-oa-border bg-oa-page lg:hidden">
      <div
        ref={row}
        onScroll={measure}
        className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        // The edge cues below replace the global scroll fade, which only some browsers can draw.
        style={{ animation: "none", maskImage: "none", WebkitMaskImage: "none" }}
      >
        {place.sections.map((item, index) => {
          const on = item === current;
          const exact = on && pathname === item.href;
          // A thin rule where the sidebar starts a new sub-heading, so the groups read on a phone too.
          const startsGroup = index > 0 && (item.group ?? null) !== (place.sections[index - 1]!.group ?? null);
          return (
            <React.Fragment key={item.href}>
              {startsGroup ? <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-oa-border" /> : null}
              <IntentLink
                href={item.href}
                aria-current={on ? (exact ? "page" : "location") : undefined}
                className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[14px] transition-colors ${FOCUS} ${
                  on
                    ? "border-transparent bg-oa-fg font-medium text-oa-page"
                    : "border-oa-border bg-oa-card text-oa-fg hover:bg-oa-accent"
                }`}
              >
                {item.label}
              </IntentLink>
            </React.Fragment>
          );
        })}
      </div>
      {/* The cue that the row goes on: a fade into the page with an arrow that scrolls it. Decorative for screen
          readers, which get every link in the row anyway. */}
      {more.left ? <EdgeCue side="left" onClick={() => nudge(-1)} /> : null}
      {more.right ? <EdgeCue side="right" onClick={() => nudge(1)} /> : null}
    </nav>
  );
}

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function EdgeCue({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const left = side === "left";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      onClick={onClick}
      className={`absolute inset-y-0 ${left ? "left-0 justify-start pl-1" : "right-0 justify-end pr-1"} flex w-12 items-center text-oa-muted-fg`}
      style={{ background: `linear-gradient(to ${left ? "left" : "right"}, transparent, var(--oa-page) 55%)` }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={left ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} />
      </svg>
    </button>
  );
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
  const pathname = usePathname() ?? "/";
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
  const pathname = usePathname() ?? "/";
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
