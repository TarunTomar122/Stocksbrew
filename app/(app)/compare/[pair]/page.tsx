import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { CompareView } from "@/components/compare-desk/compare-view";
import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { closeWords } from "@/lib/benchmark-day";
import { AppPage, PageHead, Panel, SourceLine, fmtDay } from "@/components/oa/kit";
import { todayET } from "@/lib/calendar-shared";
import { getViewer } from "@/lib/entitlements-server";
import { ogImage } from "@/lib/og/url";
import { sectorSlug, type ScreenerRow } from "@/lib/screener-shared";
import { insiderHref, pairHref, pairIsIndexable, parsePairSlug, sectorHref, stockLabel, type StockPair } from "@/lib/seo/families";
import { getCoverage, pairsFor, stockPairs, type Coverage } from "@/lib/seo/family-data";
import { shortCompanyName } from "@/lib/plain-copy";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

/**
 * Stock against stock: /compare/amd-vs-nvda. One page per pair of rivals in
 * the same industry (lib/seo/families.ts buildPairs); any other pair of
 * tickers is a 404 here and lives on the desk (/compare?symbols=A,B). The
 * body is the compare desk's, led by what separates the two.
 *
 * No loading.tsx above this segment: the existence check runs before the
 * first byte, so an unknown pair is a real 404 and the reverse order a real
 * 308 (middleware.ts does that one first).
 */

export const revalidate = 900;

type Props = { params: { pair: string }; searchParams: Record<string, string | string[] | undefined> };

const BASE = "https://www.stocksbrew.online";

type Resolved = { pair: StockPair; coverage: Coverage; first: ScreenerRow; second: ScreenerRow };

async function resolve(raw: string): Promise<Resolved | null> {
  const parsed = parsePairSlug(raw);
  if (!parsed) return null;
  const coverage = await getCoverage();
  const pair = stockPairs(coverage).find((item) => item.slug === parsed.slug);
  const first = coverage.bySymbol.get(parsed.a);
  const second = coverage.bySymbol.get(parsed.b);
  if (!pair || !first || !second) return null;
  return { pair, coverage, first, second };
}

function name(row: ScreenerRow): string {
  return row.name?.trim() || row.symbol;
}

function oneYear(row: ScreenerRow): string | null {
  return typeof row.ret_1y === "number" ? `${row.symbol} ${row.ret_1y >= 0 ? "+" : "−"}${Math.abs(row.ret_1y).toFixed(0)}% over a year` : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params.pair);
  if (!found) return { title: "Comparison not found", robots: { index: false, follow: true } };
  const { pair, first, second, coverage } = found;
  const path = pairHref(pair.a, pair.b);
  const title = `${pair.a} vs ${pair.b} Stock Compared: Returns, Valuation and Growth`;
  const facts = [oneYear(first), oneYear(second)].filter(Boolean).join(", ");
  const calls = first.call && second.call ? ` Our call: ${first.symbol} ${first.call}, ${second.symbol} ${second.call}.` : "";
  const description = `${name(first)} against ${name(second)} (${pair.group}), side by side: returns, P/E, revenue growth, margins, balance sheet and analyst targets.${facts ? ` ${facts.charAt(0).toUpperCase()}${facts.slice(1)}.` : ""}${calls}`;
  const index = pairIsIndexable(first, second, todayET());
  const shareImage = ogImage(["compare", `${pair.a},${pair.b}`], `${pair.a} vs ${pair.b}, side by side`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index, follow: true },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

function LinkList({ items }: { items: Array<{ href: string; label: string }> }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.href} className="border-b border-oa-border last:border-b-0">
          <AppLink href={item.href} className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-oa-fg outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
            <span className="min-w-0 truncate">{item.label}</span>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

export default async function PairPage({ params, searchParams }: Props) {
  const parsed = parsePairSlug(params.pair);
  if (!parsed) notFound();
  if (!parsed.isCanonical) permanentRedirect(`/compare/${parsed.slug}`);
  const found = await resolve(params.pair);
  if (!found) notFound();
  const { pair, coverage, first, second } = found;
  const viewer = await getViewer();
  const range = Array.isArray(searchParams.range) ? searchParams.range[0] : searchParams.range;
  const path = pairHref(pair.a, pair.b);
  const sector = first.sector && first.sector === second.sector ? first.sector : null;
  const allPairs = stockPairs(coverage);
  const more = [first, second].map((row) => ({
    row,
    pairs: pairsFor(allPairs, row.symbol).filter((item) => item.slug !== pair.slug),
  }));
  const label = (item: StockPair) => `${item.a} vs ${item.b}`;

  return (
    <AppPage>
      <JsonLd
        data={breadcrumbLd([
          { name: "Compare", path: "/compare" },
          ...(sector ? [{ name: sector, path: sectorHref(sectorSlug(sector)) }] : []),
          { name: `${pair.a} vs ${pair.b}`, path },
        ])}
      />
      <PageHead
        crumb={
          <>
            <Link prefetch={false} href="/compare">Compare</Link>
            {sector ? (
              <>
                {" / "}
                <Link prefetch={false} href={sectorHref(sectorSlug(sector))}>{sector}</Link>
              </>
            ) : null}
            {" / "}
            <span>{pair.group}</span>
          </>
        }
        // Tickers keep the title on one line on a phone; the names follow underneath.
        title={`${first.symbol} vs ${second.symbol}`}
        lede={`${shortCompanyName(name(first))} and ${shortCompanyName(name(second))}, side by side.`}
        meta={<SourceLine source="Prices and company data" asOf={coverage.priceDay ? closeWords(coverage.priceDay, fmtDay(coverage.priceDay, true)) : undefined} />}
        full
      />

      <CompareView
        symbols={[pair.a, pair.b]}
        range={range}
        viewer={viewer}
      />

      {/* Each list ends where it ends: no card padded to a taller neighbour's height (owner rule 4). A plain grid, not
          CardGrid, whose cards stretch to the row on purpose. */}
      <div className="mt-5 grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {more.map(({ row, pairs }) => (
          <Panel key={row.symbol} flush label={`${row.symbol} against its other rivals`}>
            {pairs.length ? (
              <LinkList items={pairs.map((item) => ({ href: pairHref(item.a, item.b), label: label(item) }))} />
            ) : (
              <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">No other comparison pages for {row.symbol}.</p>
            )}
          </Panel>
        ))}
        <Panel flush label="More on these two">
          <LinkList
            items={[
              { href: `/stock/${encodeURIComponent(first.symbol)}`, label: `${stockLabel(first.name, first.symbol)} report` },
              { href: `/stock/${encodeURIComponent(second.symbol)}`, label: `${stockLabel(second.name, second.symbol)} report` },
              { href: `/calendar/earnings/${encodeURIComponent(first.symbol)}`, label: `${first.symbol} earnings` },
              { href: `/calendar/earnings/${encodeURIComponent(second.symbol)}`, label: `${second.symbol} earnings` },
              { href: insiderHref(first.symbol), label: `${first.symbol} insider trades` },
              { href: insiderHref(second.symbol), label: `${second.symbol} insider trades` },
              ...(sector ? [{ href: sectorHref(sectorSlug(sector)), label: `${sector} stocks` }] : []),
            ]}
          />
        </Panel>
      </div>
    </AppPage>
  );
}
