"use client";

import { IntentLink } from "@/components/oa/intent-link";
import { usePublicPathname } from "@/lib/use-public-pathname";

import { MARKETING_LINKS, isNavItemActive } from "@/components/oa/nav-items";

/** The marketing bar's links, from lg up. Below lg the bottom tab bar is the nav. */
export function MarketingLinks() {
  const pathname = usePublicPathname() ?? "/";
  return (
    <nav aria-label="Site" className="hidden min-w-0 items-center gap-0.5 lg:flex">
      {MARKETING_LINKS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <IntentLink
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-[15px] outline-none transition-colors hover:text-oa-fg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)] ${
              active ? "font-medium text-oa-fg" : "text-[color-mix(in_srgb,var(--oa-fg)_78%,var(--oa-muted-fg))]"
            }`}
          >
            {item.label}
          </IntentLink>
        );
      })}
    </nav>
  );
}
