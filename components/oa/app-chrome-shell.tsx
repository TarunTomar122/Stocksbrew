"use client";

import type * as React from "react";
import Link from "next/link";

import { AskPanelButton, AskPanelHost } from "@/components/ask/ask-panel-host";
import { InboxBell } from "@/components/inbox/inbox-bell";
import { MarketingBar } from "@/components/oa/marketing-bar";
import { MobileNav } from "@/components/oa/mobile-nav";
import { isMarketingPath } from "@/components/oa/nav-items";
import { OaHeaderSearchButton } from "@/components/oa/oa-header-search-button";
import { PlaceStrip } from "@/components/oa/place-nav";
import { SidebarNav } from "@/components/oa/sidebar-nav";
import { StocksbrewLogo } from "@/components/stocksbrew-logo";
import { usePublicPathname } from "@/lib/use-public-pathname";

/**
 * The chrome's markup, as one client component. It is still rendered on the
 * server (every link is in the first HTML), but the page's RSC payload only
 * carries a reference to this module and the three account corners, instead
 * of the whole sidebar, top bar and marketing bar a second time. The corners
 * stay server components (they read the session) and come in as slots.
 *
 * Pricing, docs, about, security, legal and the blog get the marketing top bar
 * instead of the sidebar, picked by route here, so a click from /docs to
 * /briefing swaps the chrome without a reload.
 */
export function AppChromeShell({
  sidebarAccount,
  topBarAccount,
  marketingAccount,
}: {
  sidebarAccount: React.ReactNode;
  topBarAccount: React.ReactNode;
  marketingAccount: React.ReactNode;
}) {
  const pathname = usePublicPathname() ?? "/";
  return (
    <>
      {isMarketingPath(pathname) ? (
        <MarketingBar account={marketingAccount} />
      ) : (
        <>
          <aside className="oa-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-oa-border bg-oa-page lg:flex">
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 pl-5 pr-3">
              <Link prefetch={false} href="/" className="text-oa-fg">
                <StocksbrewLogo markSize={22} wordmarkClassName="text-[16px] font-medium tracking-tight" />
              </Link>
              {/* The inbox: a plain bell on first paint; the unread count is fetched once the page is idle. */}
              <InboxBell variant="sidebar" />
            </div>
            <div className="px-3 pb-3">
              <OaHeaderSearchButton trigger="row" />
              <AskPanelButton variant="row" />
            </div>
            <SidebarNav />
            <div className="flex h-14 shrink-0 items-center gap-3 border-t border-oa-border px-4">{sidebarAccount}</div>
          </aside>

          {/* Under 380px the wordmark goes (screen readers still hear it) and the gaps tighten, so search, Ask, the
              bell and Start free always fit whole on the smallest phones (council, round 3: clipped at 320). */}
          <header className="sticky top-0 z-40 flex h-[52px] items-center justify-between gap-2 border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_88%,transparent)] px-4 py-2 backdrop-blur-xl max-[379px]:px-3 lg:hidden">
            <Link prefetch={false} href="/" className="shrink-0 text-oa-fg">
              <StocksbrewLogo markSize={22} wordmarkClassName="text-[16px] font-medium tracking-tight max-[379px]:sr-only" />
            </Link>
            <div className="flex min-w-0 items-center gap-2 max-[379px]:gap-1.5">
              <OaHeaderSearchButton />
              <AskPanelButton variant="pill" />
              <InboxBell variant="topbar" />
              {topBarAccount}
            </div>
          </header>
          <PlaceStrip />
        </>
      )}
      <MobileNav />
      {/* Ask beside any page: only the button and a click catcher load with the page; the panel loads on first open. */}
      <AskPanelHost />
    </>
  );
}
