import { Suspense } from "react";

import { AskPanelButton, AskPanelHost } from "@/components/ask/ask-panel-host";
import { ChromeSwitch } from "@/components/oa/chrome-switch";
import { MarketingBar } from "@/components/oa/marketing-bar";
import { MobileNav } from "@/components/oa/mobile-nav";
import { OaHeaderSearchButton } from "@/components/oa/oa-header-search-button";
import { OaProfileButton } from "@/components/oa/oa-profile-button";
import { PlaceStrip } from "@/components/oa/place-nav";
import { SidebarNav } from "@/components/oa/sidebar-nav";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { getLandingUserContext } from "@/components/landing-data";
import { StocksbrewLogo } from "@/components/stocksbrew-logo";
import Link from "next/link";

/**
 * The app's chrome: sidebar at lg and up; below lg a slim top bar, the strip
 * of the current place's pages under it, and a bottom tab bar. Pricing, docs, about, security, legal and the blog get the marketing
 * top bar instead of the sidebar (ChromeSwitch picks by route). It is rendered once, by app/(app)/layout.tsx, and stays mounted
 * while pages change underneath it, so a click never redraws the navigation.
 *
 * Nothing here waits for the session except the two account corners, which
 * stream in behind a placeholder of the same size.
 */

function CornerGhost({ wide }: { wide: boolean }) {
  return (
    <>
      <div className="size-8 animate-pulse rounded-full bg-oa-secondary motion-reduce:animate-none" />
      {wide ? <div className="h-3 w-20 animate-pulse rounded bg-oa-secondary motion-reduce:animate-none" /> : null}
    </>
  );
}

async function SidebarAccount() {
  const user = await getLandingUserContext();
  // An outline: the page beside the sidebar owns the view's one filled button.
  if (!user.signedIn) return <StartFreeButton surface="header" size="sm" variant="outline" label="Start free" className="w-full" />;
  return (
    <>
      <OaProfileButton />
      <Link prefetch={false} href="/profile" className="min-w-0 truncate text-[14px] text-oa-muted-fg hover:text-oa-fg">
        Account
      </Link>
      {user.isSubscribed ? (
        <span className="oa-caption ml-auto">Pro</span>
      ) : (
        <Link prefetch={false} href="/pricing" className="ml-auto text-[13px] font-medium text-oa-primary hover:underline">
          Go Pro
        </Link>
      )}
    </>
  );
}

async function TopBarAccount() {
  const user = await getLandingUserContext();
  return user.signedIn ? <OaProfileButton /> : <StartFreeButton surface="header" size="sm" variant="outline" label="Start free" />;
}

/** The marketing bar's corner: open the app when signed in, start free (as an outline) when not. */
export async function MarketingAccount() {
  const user = await getLandingUserContext();
  if (!user.signedIn) return <StartFreeButton surface="header" size="sm" variant="outline" label="Start free" />;
  return (
    <>
      <Link prefetch={false} href="/briefing" className="hidden rounded-md px-2 py-1.5 text-[15px] font-medium text-oa-fg hover:bg-oa-accent sm:inline-flex">
        Open the app
      </Link>
      <OaProfileButton />
    </>
  );
}

export function AppChrome() {
  const app = (
    <>
      <aside className="oa-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-oa-border bg-oa-page lg:flex">
        <Link prefetch={false} href="/" className="flex h-14 shrink-0 items-center px-5 text-oa-fg">
          <StocksbrewLogo markSize={22} wordmarkClassName="text-[16px] font-medium tracking-tight" />
        </Link>
        <div className="px-3 pb-3">
          <OaHeaderSearchButton trigger="row" />
          <AskPanelButton variant="row" />
        </div>
        <SidebarNav />
        <div className="flex h-14 shrink-0 items-center gap-3 border-t border-oa-border px-4">
          <Suspense fallback={<CornerGhost wide />}>
            <SidebarAccount />
          </Suspense>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex h-[52px] items-center justify-between border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_88%,transparent)] px-4 py-2 backdrop-blur-xl lg:hidden">
        <Link prefetch={false} href="/" className="text-oa-fg">
          <StocksbrewLogo markSize={22} wordmarkClassName="text-[16px] font-medium tracking-tight" />
        </Link>
        <div className="flex items-center gap-2">
          <OaHeaderSearchButton />
          <AskPanelButton variant="pill" />
          <Suspense fallback={<CornerGhost wide={false} />}>
            <TopBarAccount />
          </Suspense>
        </div>
      </header>
      <PlaceStrip />
    </>
  );
  const marketing = (
    <MarketingBar
      account={
        <Suspense fallback={<CornerGhost wide={false} />}>
          <MarketingAccount />
        </Suspense>
      }
    />
  );
  return (
    <>
      <ChromeSwitch app={app} marketing={marketing} />
      <MobileNav />
      {/* Ask beside any page: only the button and a click catcher load with the page; the panel loads on first open. */}
      <AskPanelHost />
    </>
  );
}
