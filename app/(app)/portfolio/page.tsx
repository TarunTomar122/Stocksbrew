import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { JsonLd } from "@/components/docs/json-ld";
import { AppPage, PageHead } from "@/components/oa/kit";
import { HoldingsStream } from "@/components/portfolio/holdings-stream";
import { PortfolioGhost } from "@/components/portfolio/portfolio-ghost";
import { myStocksTab } from "@/lib/portfolio-shared";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio");

type Search = Record<string, string | string[] | undefined>;

/**
 * My stocks, the one home for what a person owns and watches. It opens on the holdings (owner, Nov 12: "lets remove
 * the overview page completely ... holdings directly is what i want, we dont need overview since briefing is there");
 * Watching and Alerts are tabs of the same client page (components/portfolio/holdings-stream, which was /watchlist),
 * Taxes its own page. Signed out, every view is the example portfolio.
 */
export default function PortfolioHomePage({ searchParams }: { searchParams?: Search }) {
  // Taxes is its own page; a ?tab=taxes link goes there.
  if (String(searchParams?.tab ?? "").toLowerCase() === "taxes") redirect("/portfolio/taxes");
  const tab = myStocksTab(searchParams) ?? "positions";
  return (
    <AppPage width="dash">
      <JsonLd data={toolPageLd("/portfolio")} />
      <PageHead
        title="My stocks"
        note={false}
        inline
        // A thesis across the holdings, with measurable lines per company, that the agent checks on every report and filing.
        actions={
          <Link
            prefetch={false}
            href="/agents/theses/new"
            className="inline-flex h-8 items-center rounded-lg border border-oa-border bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))]"
          >
            Write a thesis
          </Link>
        }
      />
      <Suspense fallback={<PortfolioGhost />}>
        <HoldingsStream tab={tab} />
      </Suspense>
    </AppPage>
  );
}
