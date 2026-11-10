import type { Metadata } from "next";

import { PageHead, SourceLine, fmtStampET } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { interTight } from "@/components/oa/font";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { PortfolioTaxTabs, TaxView } from "@/components/portfolio-tax/tax-view";
import { TaxSignIn } from "@/components/portfolio-tax/tax-sign-in";
import { getSessionUser } from "@/lib/auth-server";
import { newYorkToday } from "@/lib/portfolio-data";
import { buildTaxPicture } from "@/lib/portfolio-tax";
import { buildTaxRead } from "@/lib/portfolio-tax-insights";
import { loadTaxView, type TaxViewData } from "@/lib/portfolio-tax-data";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio tax",
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

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className="oa-page-frame mx-auto w-full max-w-[76rem] px-2 pb-24 pt-3 sm:px-6 sm:pt-5 lg:pb-10">
        <PageHead title="Portfolio tax" meta={data.pricesAsOf ? source : undefined} note={false} className="!mb-1" />
        <div className="mb-3">
          <PortfolioTaxTabs />
        </div>
        {session ? (
          <>
            <TheRead read={buildTaxRead(data.picture, currentYear)} label={`Your taxes in ${currentYear}`} className="mb-3" />
            <TaxView data={data} year={year} currentYear={currentYear} editable />
          </>
        ) : (
          <TaxSignIn />
        )}
      </div>
    </main>
  );
}
