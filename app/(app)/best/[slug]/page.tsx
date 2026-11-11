import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RankedList } from "@/components/best-stocks/ranked-list";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, CardGrid, NUM, PageHead, Panel, SourceLine, fmtDay } from "@/components/oa/kit";
import {
  LIST_MIN_STOCKS,
  LIST_SHOW,
  bestListHref,
  buildListRead,
  getBestList,
  itemListLd,
  listDescription,
  listTitle,
  relatedLists,
} from "@/lib/best-stocks";
import { getBestListPage } from "@/lib/best-stocks-data";
import { ogImage } from "@/lib/og/url";
import { sectorSlug } from "@/lib/screener-shared";
import { sectorHref } from "@/lib/seo/families";

/**
 * One "best stocks for X" list (/best/dividend-stocks-under-50): the rule in
 * one sentence, the read, then the ranked stocks, rebuilt from the stored
 * screener snapshot (and Form 4 or 13F filings for the two filing lists).
 * No loading.tsx in this segment, so an unknown list is a real 404. A list
 * with fewer than LIST_MIN_STOCKS stocks today still renders, says so, and
 * is noindexed (listIsIndexable).
 */

export const revalidate = 900;

type Props = { params: { slug: string } };

const BASE = "https://www.stocksbrew.online";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const list = getBestList(params.slug);
  if (!list) return { title: "List not found", robots: { index: false, follow: true } };
  const { built, indexable } = await getBestListPage(list);
  const path = bestListHref(list.slug);
  const title = listTitle(built);
  const description = listDescription(built);
  const shareImage = ogImage(["page", "screener"], list.heading, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: indexable, follow: true },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function BestListPage({ params }: Props) {
  const list = getBestList(params.slug);
  if (!list || list.slug !== params.slug) notFound();
  const { built, input } = await getBestListPage(list);
  const path = bestListHref(list.slug);
  const read = buildListRead(built, input);
  const closeDay = built.day ? `the ${fmtDay(built.day, true)} close` : undefined;

  const sectors = new Map<string, number>();
  for (const row of built.ranked) if (row.sector) sectors.set(row.sector, (sectors.get(row.sector) ?? 0) + 1);
  const sectorList = [...sectors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const related = relatedLists(list);

  const label =
    built.count === 0
      ? "No stocks today"
      : built.count > LIST_SHOW
        ? `The top ${LIST_SHOW} of ${built.count}`
        : `${built.count === 1 ? "1 stock" : `${built.count} stocks`}, ranked`;

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Best stock lists", path: "/best" }, { name: list.heading, path }])} />
      {built.shown.length > 0 ? <JsonLd data={itemListLd(built)} /> : null}
      <PageHead
        crumb={<a href="/best">Best stock lists</a>}
        title={list.heading}
        meta={<SourceLine source="Prices and company data" asOf={closeDay} />}
        note={false}
      />

      <section aria-label="The rule" className="mb-4 px-2 sm:px-0">
        <p className="max-w-[52rem] text-pretty text-[15px] leading-[22px] text-oa-fg">
          <span className="font-medium">The rule: </span>
          {built.rule}
        </p>
        <p className="mt-1 text-pretty text-[14px] leading-5 text-oa-muted-fg">{list.ranked}</p>
      </section>

      {built.count < LIST_MIN_STOCKS ? (
        <p className="oa-surface mb-4 border border-oa-border bg-oa-card px-4 py-3 text-pretty text-[14px] leading-5 text-oa-fg">
          {built.count === 0
            ? "No stock we cover meets this rule today. The list is rebuilt after every trading day, so check back after the next close."
            : `Only ${built.count === 1 ? "one stock meets" : `${built.count} stocks meet`} this rule today, which is too few to call it a list. It is rebuilt after every trading day.`}
        </p>
      ) : null}

      <TheRead read={read} label="In short" fold="phone" foldLabel="Show what stands out" className="mb-4" />

      {built.shown.length > 0 ? (
        <Panel flush className="mb-4" label={label}>
          <RankedList built={built} />
          {built.count > LIST_SHOW ? (
            <p className="border-t border-oa-border px-4 py-2.5 text-[13px] leading-5 text-oa-muted-fg">
              {built.count - LIST_SHOW} more {built.count - LIST_SHOW === 1 ? "stock meets" : "stocks meet"} the rule today and rank below these.
            </p>
          ) : null}
        </Panel>
      ) : null}

      <CardGrid cols={2} className="mb-4">
        <Panel flush fill label="Related lists">
          <ul>
            {related.map((item) => (
              <li key={item.slug} className="border-b border-oa-border last:border-b-0">
                <a
                  href={bestListHref(item.slug)}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
                >
                  <span className="min-w-0 text-pretty">{item.heading}</span>
                  <span className="shrink-0 text-[12.5px] text-oa-muted-fg">{item.group}</span>
                </a>
              </li>
            ))}
            <li>
              <a href="/best" className="block px-4 py-2.5 text-[14px] text-oa-primary outline-none hover:bg-oa-accent hover:underline focus-visible:bg-oa-accent">
                All lists →
              </a>
            </li>
          </ul>
        </Panel>
        <Panel flush fill label="Sectors on this list">
          {sectorList.length ? (
            <ul>
              {sectorList.map(([sector, count]) => (
                <li key={sector} className="border-b border-oa-border last:border-b-0">
                  <a
                    href={sectorHref(sectorSlug(sector))}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent"
                  >
                    <span className="min-w-0 text-pretty">{sector} stocks</span>
                    <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{count} on this list</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No stocks on this list today.</p>
          )}
          <a href="/screener" className="oa-card-foot mt-auto block border-t border-oa-border px-4 py-2.5 text-[14px] text-oa-primary outline-none hover:bg-oa-accent hover:underline focus-visible:bg-oa-accent">
            Build your own screen →
          </a>
        </Panel>
      </CardGrid>

      <SourceLine
        className="px-2 sm:px-0"
        source={list.source === "insiders" ? "SEC Form 4 filings and prices" : list.source === "funds" ? "13F filings and prices" : "Prices and company data"}
        asOf={closeDay}
        note="Updated after every trading day"
      />
    </AppPage>
  );
}
