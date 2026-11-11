import { Suspense } from "react";

import { AppChromeShell } from "@/components/oa/app-chrome-shell";
import { OaProfileButton } from "@/components/oa/oa-profile-button";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { getLandingUserContext } from "@/components/landing-data";
import Link from "next/link";

/**
 * The app's chrome: sidebar at lg and up; below lg a slim top bar, the strip
 * of the current place's pages under it, and a bottom tab bar. Pricing, docs, about, security, legal and the blog get the marketing
 * top bar instead of the sidebar (AppChromeShell picks by route). It is rendered once, by app/(app)/layout.tsx (and by the 404 page, which sits outside it), and stays mounted
 * while pages change underneath it, so a click never redraws the navigation.
 *
 * Nothing here waits for the session except the account corners, which
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
  // The markup lives in a client component so the RSC payload carries one reference instead of the whole chrome
  // (components/oa/app-chrome-shell.tsx); only the account corners, which wait for the session, are rendered here.
  return (
    <AppChromeShell
      sidebarAccount={
        <Suspense fallback={<CornerGhost wide />}>
          <SidebarAccount />
        </Suspense>
      }
      topBarAccount={
        <Suspense fallback={<CornerGhost wide={false} />}>
          <TopBarAccount />
        </Suspense>
      }
      marketingAccount={
        <Suspense fallback={<CornerGhost wide={false} />}>
          <MarketingAccount />
        </Suspense>
      }
    />
  );
}
