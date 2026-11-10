import type { Metadata } from "next";

import { CompareView } from "@/components/compare-desk/compare-view";
import { ComparePicker } from "@/components/compare-desk/picker";
import { LockCard } from "@/components/oa/gate";
import { AppPage, NUM, PageHead, Panel } from "@/components/oa/kit";
import { BasketActions } from "@/components/screener/basket-actions";
import { LINE_COLORS } from "@/components/screener/controls";
import { StockLogo } from "@/components/stock-logo";
import { COMPARE_MAX, compareHref, legacyCompareSymbols } from "@/lib/compare-shared";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getScreenerDirectory } from "@/lib/screener";
import { ogImage } from "@/lib/og/url";
import { pairSlug } from "@/lib/seo/families";
import { getCoverage, stockPairs } from "@/lib/seo/family-data";

type SearchParams = Record<string, string | string[] | undefined>;

const BASE = "https://www.stocksbrew.online";

const STARTERS: Array<{ symbols: string[]; why: string }> = [
  { symbols: ["NVDA", "AMD"], why: "The two AI chip names" },
  { symbols: ["AAPL", "MSFT", "GOOGL"], why: "Three of the largest companies" },
  { symbols: ["KO", "PEP"], why: "Two dividend staples" },
  { symbols: ["JPM", "BAC", "WFC"], why: "The big banks" },
  { symbols: ["LLY", "NVO"], why: "The weight-loss drug makers" },
  { symbols: ["XOM", "CVX"], why: "The oil majors" },
];

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const symbols = legacyCompareSymbols(searchParams);
  if (symbols.length >= 2) {
    const names = symbols.join(" vs ");
    const title = `${names}: stock comparison`;
    const description = `${names} side by side: returns, valuation, growth, margins, balance sheet, analyst targets and our read on each.`;
    // Two rivals with a page of their own (/compare/a-vs-b) point search engines there.
    const pairPage =
      symbols.length === 2 && stockPairs(await getCoverage()).some((pair) => pair.slug === pairSlug(symbols[0]!, symbols[1]!))
        ? `/compare/${pairSlug(symbols[0]!, symbols[1]!)}`
        : null;
    const canonical = pairPage ?? compareHref(symbols);
    // The card puts the stocks side by side with today's prices and our call on each.
    const shareImage = ogImage(["compare", symbols.slice(0, 4).join(",")], `${names}, side by side`, { daily: true });
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${canonical}`, images: [shareImage] },
      twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
    };
  }
  const title = "Compare Stocks Side by Side: Returns, Valuation, Growth and Margins";
  const description =
    "Put two to four US stocks next to each other: price and returns, valuation, growth, profitability, balance sheet, earnings and our read, with the best value in each row marked.";
  return {
    title,
    description,
    alternates: { canonical: "/compare" },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}/compare`, images: [ogImage(["page", "compare"], "Compare US stocks side by side")] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [ogImage(["page", "compare"], "Compare US stocks side by side")] },
  };
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await getViewer();
  const limit = Math.min(limitFor("compare", viewer.plan), COMPARE_MAX);
  const proLimit = Math.min(limitFor("compare", "pro"), COMPARE_MAX);
  const requested = legacyCompareSymbols(searchParams);
  const symbols = requested.slice(0, limit);
  const trimmed = requested.slice(limit);
  const range = Array.isArray(searchParams.range) ? searchParams.range[0] : searchParams.range;

  const directory = await getScreenerDirectory().catch(() => []);

  const head = (
    <PageHead
      label="Explore"
      title={symbols.length >= 2 ? symbols.join(" vs ") : "Compare stocks"}
      lede="Two to four stocks side by side, with the best value in each row marked."
      className={symbols.length >= 2 ? "[&_.oa-head-lede]:hidden" : ""}
      // The picker view keeps its one line in the head instead of repeating it at the bottom.
      full={symbols.length < 2}
      actions={symbols.length >= 2 ? <div className="max-sm:hidden"><BasketActions symbols={symbols} compareLimit={0} /></div> : undefined}
    />
  );
  const picker = (
    <div className={symbols.length >= 2 ? "mb-3" : "oa-surface mb-5 border border-oa-border bg-oa-card p-4"}>
      <ComparePicker symbols={symbols} directory={directory} limit={limit} proLimit={proLimit} colors={LINE_COLORS} />
    </div>
  );

  if (symbols.length < 2) {
    return (
      <AppPage>
        {head}
        {picker}
        <Panel flush label={symbols.length === 1 ? `Pick a second stock to put next to ${symbols[0]}` : "Start with a pair"}>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3">
            {STARTERS.map((starter) => (
              <li key={starter.symbols.join()} className="-mb-px -mr-px border-b border-r border-oa-border">
                <a href={compareHref(starter.symbols.slice(0, limit))} className="flex h-full items-center gap-3 px-4 py-3.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className="flex shrink-0">
                    {starter.symbols.slice(0, limit).map((symbol) => (
                      <span key={symbol} className="-ml-1.5 rounded-full ring-2 ring-oa-card first:ml-0">
                        <StockLogo ticker={symbol} size={26} circle />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className={`${NUM} block text-[14px] font-medium text-oa-fg`}>{starter.symbols.slice(0, limit).join(" vs ")}</span>
                    <span className="block text-[13px] text-oa-muted-fg">{starter.why}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </AppPage>
    );
  }

  return (
    <AppPage>
      {head}
      {picker}
      {trimmed.length > 0 ? (
        <LockCard
          feature="compare"
          plan={viewer.plan}
          trialEligible={viewer.trialEligible}
          className="mb-5"
          body={`This link names ${requested.length} stocks. Showing ${symbols.join(", ")}; ${trimmed.join(", ")} ${trimmed.length === 1 ? "is" : "are"} left out.`}
        />
      ) : null}
      <CompareView symbols={symbols} range={range} viewer={viewer} />
    </AppPage>
  );
}
