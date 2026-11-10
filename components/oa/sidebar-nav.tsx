"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/oa/nav-icon";
import { MORE_LINKS, PLACES, placeFor, sectionFor, type NavItem, type NavPlace } from "@/components/oa/nav-items";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

function PlaceRow({ place, active, current }: { place: NavPlace; active: boolean; current: boolean }) {
  return (
    <Link
      href={place.href}
      title={place.blurb}
      aria-current={current ? "page" : active ? "location" : undefined}
      className={`flex h-9 items-center gap-3 rounded-md px-3 text-[14.5px] transition-colors ${FOCUS} ${
        active ? "font-semibold text-oa-fg" : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
      }`}
    >
      <NavIcon name={place.icon} className={`size-[18px] shrink-0 ${active ? "text-oa-primary" : ""}`} />
      <span className="truncate">{place.label}</span>
    </Link>
  );
}

function SectionRow({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`flex h-8 items-center rounded-md pl-3 pr-2 text-[14px] transition-colors ${FOCUS} ${
        current
          ? "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] font-medium text-oa-fg"
          : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
      }`}
    >
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * The sidebar's link list: the five places, and under the one you are in,
 * its pages. A stock page lights Research with no page under it lit (the
 * stock is its own page); the trail above the stock's name says the rest.
 */
export function SidebarNav() {
  const pathname = usePathname() ?? "/";
  const place = placeFor(pathname);
  const current = sectionFor(pathname, place);
  return (
    <nav aria-label="Site" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
      <ul className="flex flex-col gap-0.5">
        {PLACES.map((item) => {
          const active = item === place;
          const showSections = active && item.sections.length > 1;
          return (
            <li key={item.href}>
              <PlaceRow place={item} active={active} current={active && !showSections && pathname === item.href} />
              {showSections ? (
                <ul className="mb-2 ml-[21px] mt-0.5 flex flex-col gap-px border-l border-oa-border pl-2">
                  {item.sections.map((sub, index) => {
                    const heading = sub.group && sub.group !== item.sections[index - 1]?.group ? sub.group : null;
                    return (
                      <li key={sub.href}>
                        {heading ? <p className="oa-caption px-3 pb-1 pt-2.5">{heading}</p> : null}
                        <SectionRow item={sub} current={sub === current} />
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 px-3 pt-4 text-[13px] leading-5">
        {MORE_LINKS.map((item) => (
          <Link key={item.href} href={item.href} className={`rounded text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
