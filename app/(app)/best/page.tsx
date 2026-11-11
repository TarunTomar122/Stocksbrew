import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { closeWords } from "@/lib/benchmark-day";
import { AppPage, CardGrid, NUM, PageHead, Panel, SourceLine, fmtDay } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { BEST_LISTS, LIST_GROUPS, bestListHref, buildHubRead, monthYear } from "@/lib/best-stocks";
import { getAllBestLists } from "@/lib/best-stocks-data";
import { ogImage } from "@/lib/og/url";

/**
 * The hub of the "best stocks for X" lists (/best): the read across all of
 * them, then every list by group with its rule, how many stocks meet it today
 * and the first three.
 */

export const revalidate = 900;

const BASE = "https://www.stocksbrew.online";

export async function generateMetadata(): Promise<Metadata> {
  const { input } = await getAllBestLists();
  const month = monthYear(input.priceDay);
  const title = `Best Stock Lists${month ? ` (${month})` : ""}: Dividend, Value, Growth and AI Stocks, Ranked`;
  const description = `${BEST_LISTS.length} lists of US stocks, each with its exact rule and ranked by one number: dividend stocks under $50, undervalued stocks, growth stocks, AI and chip stocks, stocks insiders are buying, what hedge funds bought and more. Rebuilt after every trading day.`;
  const shareImage = ogImage(["page", "screener"], "Best stock lists", { daily: true });
  return {
    title,
    description,
    alternates: { canonical: "/best" },
    robots: { index: true, follow: true },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}/best`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function BestHubPage() {
  const { input, lists } = await getAllBestLists();
  const read = buildHubRead(
    lists.map((item) => item.built),
    input,
  );
  const closeDay = input.priceDay ? closeWords(input.priceDay, fmtDay(input.priceDay, true)) : undefined;

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Best stock lists", path: "/best" }])} />
      <PageHead
        crumb={<a href="/screener">Find stocks</a>}
        title="Best stock lists"
        meta={<SourceLine source="Prices, company data and filings" asOf={closeDay} />}
        note={false}
      />
      <p className="mb-4 max-w-[52rem] px-2 text-pretty text-[15px] leading-[22px] text-oa-fg sm:px-0">
        Each list is one plain rule applied to every US stock we cover, ranked by one number. Open a list for the rule, the read and the stocks.
      </p>

      <TheRead read={read} label="Across the lists" fold="phone" foldLabel="Show what stands out" className="mb-4" />

      <CardGrid cols={2} className="mb-4">
        {LIST_GROUPS.map((group) => {
          const members = lists.filter((item) => item.built.list.group === group);
          if (members.length === 0) return null;
          return (
            <Panel key={group} flush fill label={group}>
              <ul>
                {members.map(({ built }) => (
                  <li key={built.list.slug} className="border-b border-oa-border last:border-b-0">
                    <a
                      href={bestListHref(built.list.slug)}
                      className="block px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-pretty text-[15px] font-medium leading-5 text-oa-fg">{built.list.heading}</span>
                        <span className={`${NUM} shrink-0 text-[13px] text-oa-muted-fg`}>
                          {built.count === 1 ? "1 stock" : `${built.count} stocks`}
                        </span>
                      </span>
                      <span className="mt-1 block text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{built.rule}</span>
                      {built.shown.length > 0 ? (
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {built.shown.slice(0, 3).map((row) => (
                            <span key={row.symbol} className="inline-flex items-center gap-1.5 text-[13px] leading-5 text-oa-fg">
                              <StockLogo ticker={row.symbol} size={16} />
                              <span className={NUM}>{row.symbol}</span>
                              <span className={`${NUM} text-oa-muted-fg`}>{built.list.metric.format(row.value)}</span>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </CardGrid>

      <SourceLine className="px-2 sm:px-0" source="Prices, company data and filings" asOf={closeDay} note="Updated after every trading day" />
    </AppPage>
  );
}
