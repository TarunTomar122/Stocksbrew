"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "@/components/oa/nav-icon";
import { ASK_ITEM, NAV_GROUPS, NAV_ITEMS, isNavItemActive, type NavItem } from "@/components/oa/nav-items";

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

function Row({ item, pathname, small = false }: { item: NavItem; pathname: string; small?: boolean }) {
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 text-[14px] transition-colors ${FOCUS} ${small ? "h-8" : "h-9"} ${
        active
          ? "bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] font-semibold text-oa-fg"
          : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
      }`}
    >
      <NavIcon name={item.icon} className={`size-4 shrink-0 ${active ? "text-oa-primary" : ""}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** The sidebar's link list: five places first, then the second level. */
export function SidebarNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Site" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
      <div className="flex flex-col gap-0.5">
        <Row item={ASK_ITEM} pathname={pathname} />
        <div className="my-1 border-t border-oa-border" />
        {NAV_ITEMS.map((item) => (
          <Row key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="oa-caption px-3 pb-1">{group.label}</p>
          {group.items.map((item) => (
            <Row key={item.href} item={item} pathname={pathname} small />
          ))}
        </div>
      ))}
    </nav>
  );
}
