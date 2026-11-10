"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { placeFor, sectionFor, trailFor, type Crumb } from "@/components/oa/nav-items";

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

  // Keep the current chip in view inside the row without moving the page.
  React.useEffect(() => {
    const container = row.current;
    const chip = container?.querySelector<HTMLElement>('[aria-current="page"], [aria-current="location"]');
    if (!container || !chip) return;
    const right = chip.offsetLeft + chip.offsetWidth + 24;
    if (right > container.clientWidth) container.scrollLeft = right - container.clientWidth;
  }, [pathname]);

  if (!place || place.sections.length < 2) return null;
  return (
    <nav aria-label={place.label} className="oa-place-strip border-b border-oa-border bg-oa-page lg:hidden">
      <div ref={row} className="oa-scroll-fade flex items-center gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {place.sections.map((item) => {
          const on = item === current;
          const exact = on && pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? (exact ? "page" : "location") : undefined}
              className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-[14px] transition-colors ${FOCUS} ${
                on
                  ? "border-transparent bg-oa-fg font-medium text-oa-page"
                  : "border-oa-border bg-oa-card text-oa-fg hover:bg-oa-accent"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
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
          <Link href={crumb.href} className={`rounded ${FOCUS}`}>
            {crumb.label}
          </Link>
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
