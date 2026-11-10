import type * as React from "react";

import { MarketingLinks } from "@/components/oa/marketing-links";
import { OaHeaderSearchButton } from "@/components/oa/oa-header-search-button";
import { StocksbrewLogo } from "@/components/stocksbrew-logo";

/**
 * The top bar for the pages a visitor reads before using the product: the
 * landing, pricing, docs, about, security, legal and the blog. A plain sticky
 * bar the width of the page, the way Linear, Vercel and Stripe do it, instead
 * of the app's sidebar. The account corner is passed in so the caller decides
 * how it streams.
 *
 * It never carries a filled button: the page under it owns the one filled
 * copper element (the hero search, the Pro plan).
 */
export function MarketingBar({ account }: { account: React.ReactNode }) {
  return (
    <header className="oa-topbar sticky top-0 z-40 border-b border-oa-border bg-[color-mix(in_srgb,var(--oa-page)_90%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[76rem] items-center justify-between gap-4 px-4 sm:px-6">
        <a href="/" className="shrink-0 rounded text-oa-fg outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]">
          <StocksbrewLogo markSize={22} wordmarkClassName="text-[16px] font-medium tracking-tight" />
        </a>
        <MarketingLinks />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <OaHeaderSearchButton />
          {account}
        </div>
      </div>
    </header>
  );
}
