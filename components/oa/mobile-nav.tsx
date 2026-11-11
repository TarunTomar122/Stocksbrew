"use client";

import { IntentLink } from "@/components/oa/intent-link";
import { usePublicPathname } from "@/lib/use-public-pathname";

import { NavIcon } from "@/components/oa/nav-icon";
import { PLACES, placeFor } from "@/components/oa/nav-items";

/** Bottom tab bar below lg: the same five places as the sidebar, by their short names. */
export function MobileNav() {
  const pathname = usePublicPathname() ?? "/";
  const place = placeFor(pathname);
  return (
    <nav
      aria-label="Mobile navigation"
      className="oa-mobile-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-oa-border bg-oa-card px-1 pb-[max(env(safe-area-inset-bottom),4px)] pt-1 lg:hidden"
    >
      {PLACES.map((item) => {
        const active = item === place;
        return (
          <IntentLink
            key={item.href}
            href={item.href}
            aria-current={active ? (pathname === item.href ? "page" : "location") : undefined}
            className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg py-1 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
              active ? "font-semibold text-oa-primary" : "text-oa-muted-fg"
            }`}
          >
            <NavIcon name={item.icon} className="size-[22px]" />
            <span className="truncate">{item.short}</span>
          </IntentLink>
        );
      })}
    </nav>
  );
}
