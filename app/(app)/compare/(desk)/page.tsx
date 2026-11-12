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
import { getCoverage, pairsFor, stockPairs } from "@/lib/seo/family-data";
import { AppLink } from "@/components/oa/app-link";

type SearchParams = Record<string, string | string[] | undefined>;

const BASE = "https://www.stocksbrew.online";

// Pairs people reach for first. The first is the example the desk opens on when the address names no stocks.
const STARTERS: Array<{ symbols: string[]; why: string }> = [
  { symbols: ["NVDA", "AMD"], why: "The two AI chip makers" },
  { symbols: ["AAPL", "MSFT", "GOOGL"], why: "Three of the largest companies" },
  { symbols: ["KO", "PEP"], why: "Two dividend staples" },
  { symbols: ["JPM", "BAC", "WFC"], why: "The big banks" },
  { symbols: ["LLY", "NVO"], why: "The weight-loss drug makers" },
  { symbols: ["XOM", "CVX"], why: "The oil majors" },
];
const EXAMPLE = STARTERS[0]!;

/** Overlapping logos and the tickers, for a pair someone might open next. */
function PairChip({ symbols, href }: { symbols: string[]; href: string }) {
  return (
    <AppLink
      href={href}
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-oa-border bg-oa-card pl-1.5 pr-2.5 text-[13px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
    >
      <span className="flex">
        {symbols.map((symbol) => (
          <span key={symbol} className="-ml-1 rounded-full ring-2 ring-oa-card first:ml-0">
            <StockLogo ticker={symbol} size={18} circle />
          </span>
        ))}
      </span>
      <span className={`${NUM} font-medium`}>{symbols.join(" vs ")}</span>
    </AppLink>
  );
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const symbols = legacyCompareSymbols(searchParams);
  if (symbols.length >= 2) {
    const names = symbols.join(" vs ");
    const title = `${names}: stock comparison`;
    const description = `${names} side by side: returns, valuation, growth, margins, balance sheet, analyst targets and our read on each.`;
    // Two rivals with a page of their own (/compare/a-vs-b) point search engines there.
    const pairPage =
      symbols.length === 2 && (await getCoverage().then((coverage) => stockPairs(coverage).some((pair) => pair.slug === pairSlug(symbols[0]!, symbols[1]!)), () => false))
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
  // No stocks in the address: open on a real comparison, marked as an example, instead of an empty form.
  const example = requested.length === 0;
  const symbols = example ? EXAMPLE.symbols.slice(0, limit) : requested.slice(0, limit);
  const trimmed = example ? [] : requested.slice(limit);
  const range = Array.isArray(searchParams.range) ? searchParams.range[0] : searchParams.range;

  const directory = await getScreenerDirectory().catch(() => []);

  const head = (
    <PageHead
      title={example ? "Compare stocks" : symbols.length >= 2 ? symbols.join(" vs ") : "Compare stocks"}
      // No line under the title (owner rule 8): the picker and the table under it say what this is.
      full
      actions={symbols.length >= 2 ? <div className="max-sm:hidden"><BasketActions symbols={symbols} compareLimit={0} /></div> : undefined}
    />
  );
  const picker = (
    <div className={symbols.length >= 2 ? "mb-3" : "oa-surface mb-5 border border-oa-border bg-oa-card p-4"}>
      <ComparePicker symbols={symbols} directory={directory} limit={limit} proLimit={proLimit} colors={LINE_COLORS} />
    </div>
  );

  if (symbols.length < 2) {
    // One stock in: its rivals first (the pairs we have pages for), then the usual starters.
    const one = symbols[0];
    const rivals = one
      ? await getCoverage()
          .then((coverage) => pairsFor(stockPairs(coverage), one).slice(0, 6))
          .catch(() => [])
      : [];
    const options = one
      ? rivals.length
        ? rivals.map((pair) => {
            // The other company's name: the industry would read the same on every card.
            const other = pair.a === one ? pair.b : pair.a;
            return { symbols: [one, other], why: directory.find((entry) => entry.symbol === other)?.name ?? "" };
          })
        : STARTERS.filter((starter) => !starter.symbols.includes(one)).map((starter) => {
            const other = starter.symbols[0]!;
            return { symbols: [one, other], why: directory.find((entry) => entry.symbol === other)?.name ?? "" };
          })
      : STARTERS;
    return (
      <AppPage>
        {head}
        {picker}
        <Panel flush label={one ? `Pick a second stock to put next to ${one}` : "Start with a pair"}>
          {/* Rows that wrap and stretch, so a last row of one or two fills the width instead of leaving a hole. */}
          <ul className="flex flex-wrap">
            {options.map((option) => (
              <li key={option.symbols.join()} className="-mb-px -mr-px min-w-[15rem] flex-1 basis-1/3 border-b border-r border-oa-border">
                <AppLink href={compareHref(option.symbols.slice(0, limit))} className="flex h-full items-center gap-3 px-4 py-3.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
                  <span className="flex shrink-0">
                    {option.symbols.slice(0, limit).map((symbol) => (
                      <span key={symbol} className="-ml-1.5 rounded-full ring-2 ring-oa-card first:ml-0">
                        <StockLogo ticker={symbol} size={26} circle />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className={`${NUM} block text-[14px] font-medium text-oa-fg`}>{option.symbols.slice(0, limit).join(" vs ")}</span>
                    <span className="block truncate text-[13px] text-oa-muted-fg">{option.why}</span>
                  </span>
                </AppLink>
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
      {example ? (
        // Other pairs to open in one tap, on one line that scrolls sideways on a phone.
        <div className="-mt-1 mb-4 flex gap-2 max-sm:-mx-2 max-sm:overflow-x-auto max-sm:px-2 sm:flex-wrap">
          {STARTERS.slice(1).map((starter) => (
            <PairChip key={starter.symbols.join()} symbols={starter.symbols.slice(0, limit)} href={compareHref(starter.symbols.slice(0, limit))} />
          ))}
        </div>
      ) : null}
      {trimmed.length > 0 ? (
        <LockCard
          feature="compare"
          plan={viewer.plan}
          trialEligible={viewer.trialEligible}
          className="mb-5"
          body={`This link names ${requested.length} stocks. Showing ${symbols.join(", ")}; ${trimmed.join(", ")} ${trimmed.length === 1 ? "is" : "are"} left out.`}
        />
      ) : null}
      <CompareView symbols={symbols} range={range} viewer={viewer} cached={example} />
    </AppPage>
  );
}
