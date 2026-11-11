"use client";

import Link from "next/link";

/**
 * The tabs of My stocks: the overview, the holdings editor's three views and taxes, drawn the same way on each of
 * them. Everything lives under /portfolio (the old /watchlist pages redirect here, next.config.js). The holdings,
 * watching and alerts views are one client page, so switching between them passes `onSelect` and stays in the
 * browser; the overview and taxes are their own loads.
 */

export type MyStocksTab = "overview" | "holdings" | "watching" | "alerts" | "taxes";

export const MY_STOCKS_TABS: ReadonlyArray<{ id: MyStocksTab; label: string; href: string }> = [
  { id: "overview", label: "Overview", href: "/portfolio" },
  { id: "holdings", label: "Holdings", href: "/portfolio?tab=holdings" },
  { id: "watching", label: "Watching", href: "/portfolio?tab=watching" },
  { id: "alerts", label: "Alerts", href: "/portfolio?tab=alerts" },
  { id: "taxes", label: "Taxes", href: "/portfolio/taxes" },
];

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

export function MyStocksTabs({
  current,
  counts = {},
  onSelect,
  className = "",
}: {
  current: MyStocksTab;
  /** A count beside a tab's name, only where the page already knows it. */
  counts?: Partial<Record<MyStocksTab, number>>;
  /** Handles a tab in place (return true) instead of following its link. */
  onSelect?: (tab: MyStocksTab) => boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="My stocks"
      className={`-mx-2 mb-3 flex gap-6 overflow-x-auto border-b border-oa-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {MY_STOCKS_TABS.map((tab) => {
        const active = tab.id === current;
        const count = counts[tab.id];
        return (
          <Link
            key={tab.id}
            href={tab.href}
            prefetch={false}
            scroll={false}
            // The site nav already marks the page; a tab only says it is the current one of its set.
            aria-current={active ? "true" : undefined}
            onClick={(event) => {
              if (!onSelect || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              if (onSelect(tab.id)) event.preventDefault();
            }}
            className={`-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[14px] transition-colors ${FOCUS} ${
              active ? "border-oa-primary font-medium text-oa-fg" : "border-transparent text-oa-muted-fg hover:text-oa-fg"
            }`}
          >
            {tab.label}
            {count != null ? <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
