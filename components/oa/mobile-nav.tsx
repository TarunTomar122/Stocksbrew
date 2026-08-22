"use client";

import { usePathname } from "next/navigation";

export function MobileNav() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex sm:hidden items-center justify-center gap-3 bg-oa-bg border-t border-oa-border px-4 py-4" aria-label="Mobile navigation">
      <a
        href="/pulse"
        className={`rounded-full px-4 py-2 text-base font-medium transition-colors outline-none ${
          isActive("/pulse")
            ? "bg-oa-primary text-oa-primary-fg"
            : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
        }`}
      >
        Market
      </a>
      <a
        href="/explore"
        className={`rounded-full px-4 py-2 text-base font-medium transition-colors outline-none ${
          isActive("/explore")
            ? "bg-oa-primary text-oa-primary-fg"
            : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
        }`}
      >
        Explore
      </a>
      <a
        href="/watchlist"
        className={`rounded-full px-4 py-2 text-base font-medium transition-colors outline-none ${
          isActive("/watchlist")
            ? "bg-oa-primary text-oa-primary-fg"
            : "text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
        }`}
      >
        Watchlist
      </a>
    </nav>
  );
}
