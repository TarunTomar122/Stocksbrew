import type { Metadata } from "next";
import Link from "next/link";

import { AppPage, PageHead, SourceLine, fmtStampET } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { MyStocksTabs } from "@/components/portfolio/my-stocks-tabs";
import { TaxView } from "@/components/portfolio-tax/tax-view";
import { TaxSignIn } from "@/components/portfolio-tax/tax-sign-in";
import { getSessionUser } from "@/lib/auth-server";
import { newYorkToday } from "@/lib/portfolio-data";
import { buildTaxPicture } from "@/lib/portfolio-tax";
import { buildTaxRead } from "@/lib/portfolio-tax-insights";
import { loadTaxView, type TaxViewData } from "@/lib/portfolio-tax-data";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio taxes",
  robots: { index: false, follow: true },
  description:
    "Realised gains by tax year, short and long term, harvestable losses at the latest price and wash-sale windows, from the lots you enter. US federal rules, not tax advice.",
};

type Search = Record<string, string | string[] | undefined>;

function parseYear(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const year = Number(raw);
  return Number.isInteger(year) && year >= 1990 && year <= fallback ? year : fallback;
}

export default async function PortfolioTaxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const now = new Date();
  const today = newYorkToday(now);
  const currentYear = Number(today.slice(0, 4));
  const year = parseYear(search.year, currentYear);

  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid) : null;
  const data: TaxViewData = userDoc
    ? await loadTaxView(userDoc, now)
    : { picture: buildTaxPicture({ lots: {}, holdings: null, prices: new Map(), today }), lots: {}, stocks: [], prices: {}, pricesAsOf: null };

  const source = (
    <SourceLine
      source="Prices: latest Yahoo Finance quote"
      asOf={data.pricesAsOf ? fmtStampET(data.pricesAsOf) : undefined}
    />
  );

  // Taxes is a tab of My stocks (it was /watchlist/tax until Nov 11; that address redirects here).
  return (
    <AppPage>
      <PageHead title="My stocks" meta={data.pricesAsOf ? source : undefined} />
      <MyStocksTabs current="taxes" />
      {session ? (
        <>
          <TheRead read={buildTaxRead(data.picture, currentYear)} label={`Your taxes in ${currentYear}`} className="mb-3" askContext="portfolio" />
          <p className="mb-3 px-2 text-pretty text-[14px] leading-5 text-oa-muted-fg sm:px-0">
            Wondering what to sell?{" "}
            <Link href="/portfolio/ideas" className="font-medium text-oa-primary hover:underline">
              See rebalancing and tax-loss ideas for these holdings, with the tax on each sale
            </Link>
            .
          </p>
          <TaxView data={data} year={year} currentYear={currentYear} editable />
        </>
      ) : (
        <TaxSignIn />
      )}
    </AppPage>
  );
}
