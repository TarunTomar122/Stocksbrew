import { Suspense } from "react";

import { MarketingAccount } from "@/components/oa/app-chrome";
import { MarketingBar } from "@/components/oa/marketing-bar";
import { MobileNav } from "@/components/oa/mobile-nav";

/**
 * The site chrome. Two shapes:
 *
 * - "app" (default): nothing. The app's sidebar and tab bar come from the
 *   shared layout, app/(app)/layout.tsx, so they persist across navigation.
 * - "marketing": the plain top bar the marketing pages share (pricing, docs
 *   and the rest get it from the same layout), used here by the landing,
 *   which lives outside the app group.
 */
export function OaSiteHeader({ variant = "app" }: { variant?: "app" | "marketing" } = {}) {
  // Inside the app the chrome belongs to app/(app)/layout.tsx (AppChrome),
  // which stays mounted between pages. Pages that still call this get nothing.
  if (variant !== "marketing") return null;
  return (
    <>
      <MarketingBar
        account={
          <Suspense fallback={<div className="h-8 w-[5.5rem] animate-pulse rounded-lg bg-oa-secondary motion-reduce:animate-none" />}>
            <MarketingAccount />
          </Suspense>
        }
      />
      <MobileNav />
    </>
  );
}
