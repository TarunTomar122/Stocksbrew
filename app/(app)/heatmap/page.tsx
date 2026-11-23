import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { HeatMapStack, HeatMapWide, HeatScale, SectorCards } from "@/components/heatmap/market-heatmap";
import { AppPage, Empty, PageHead, SourceLine, fmtDay } from "@/components/oa/kit";
import { closeWords, quoteDay } from "@/lib/benchmark-day";
import { etToday, onDayWords } from "@/lib/day-words";
import { getMarketSnapshot } from "@/lib/firestore";
import { heatSectors, heatSummary, layoutMap, layoutStack, mapGroups, withLiveQuotes } from "@/lib/heatmap";
import { ogImage } from "@/lib/og/url";
import type { ScreenerRow } from "@/lib/screener-shared";
import { getCoverage } from "@/lib/seo/family-data";

/**
 * The stock market heat map: the biggest US stocks we cover by sector, sized by market value and coloured by the
 * day's move, laid out on the server (lib/heatmap.ts) so the HTML holds every tile and link. Under it, the day in a
 * few sentences and every sector's best and worst stocks.
 */

// The words say "today" or "on Friday", so the page is never cached for long (lib/day-words.ts). The root layout reads
// cookies, so in practice it renders per request; the work is light (the coverage read is cached, the layouts are pure).
export const revalidate = 300;

const BASE = "https://www.stocksbrew.online";
const TITLE = "Stock Market Heat Map Today: US Stocks by Sector";
/** Tiles on the wide map and on a phone's, biggest companies first. */
const WIDE_TILES = 200;
const PHONE_TILES = 110;
/**
 * The widths the maps are laid out at: the narrowest the wide map is drawn (a 768px tablet's content column), so its
 * tiles and name strips only ever grow, and a 390px phone's.
 */
const WIDE = { width: 740, height: 474 };
const PHONE_WIDTH = 360;
/** A phone's map stays about two screens tall: the smallest tiles hold a ticker, the giants do not fill a screen each. */
const PHONE_FIT = { minTile: 1200, maxHeight: 1700 };

/**
 * The covered stocks priced as of now and the day the map is on. The screener rows are rebuilt after each close; the
 * live snapshot (one read a minute, shared app-wide) carries the hourly quotes while the market is open. Without it,
 * the map shows the last close.
 */
async function heatData(): Promise<{ rows: ScreenerRow[]; day: string | null }> {
  const [coverage, quotes] = await Promise.all([getCoverage(), getMarketSnapshot("US").catch(() => [])]);
  const rows = withLiveQuotes(coverage.rows, quotes);
  return { rows, day: quoteDay(rows, coverage.priceDay) };
}

export async function generateMetadata(): Promise<Metadata> {
  // The map's own count: the biggest companies plus each sector's leaders (lib/heatmap.ts mapGroups).
  const { rows, day } = await heatData();
  const count = mapGroups(heatSectors(rows, day), WIDE_TILES).reduce((sum, group) => sum + group.stocks.length, 0);
  const description = `Today's stock market heat map: ${count} of the biggest US stocks by sector, sized by market value and coloured by the day's move, with each sector's top movers.`;
  const shareImage = ogImage(["page", "screener"], "US stock market heat map", { daily: true });
  return {
    title: { absolute: TITLE },
    description,
    alternates: { canonical: "/heatmap" },
    robots: { index: true, follow: true },
    openGraph: { title: TITLE, description, url: `${BASE}/heatmap`, siteName: "stocksbrew", type: "website", images: [shareImage] },
    twitter: { card: "summary_large_image", title: TITLE, description, images: [shareImage] },
  };
}

export default async function HeatmapPage() {
  const { rows, day } = await heatData();
  const sectors = heatSectors(rows, day);
  const wide = layoutMap(mapGroups(sectors, WIDE_TILES), WIDE.width, WIDE.height);
  const phone = layoutStack(mapGroups(sectors, PHONE_TILES), PHONE_WIDTH, PHONE_FIT);
  const today = etToday();
  const asOf = day ? closeWords(day, fmtDay(day, true)) : null;
  const live = asOf === "today, during trading";
  const when = day ? onDayWords(day, today) : "today";
  const summary = heatSummary(sectors, when, live);
  // A tile without a move says which close it is missing ("Friday's close"), never "today" on a weekend.
  const noMove = live ? "no move yet today" : asOf ? `no move at ${asOf}` : "no move";

  return (
    <AppPage>
      <JsonLd
        data={breadcrumbLd([
          { name: "Sectors", path: "/sectors" },
          { name: "Heat map", path: "/heatmap" },
        ])}
      />
      <PageHead
        title="Stock market heat map"
        meta={asOf ? <SourceLine asOf={asOf} /> : undefined}
        actions={<HeatScale className="max-lg:hidden" />}
        note={false}
      />
      {wide.blocks.length === 0 ? (
        <Empty title="No prices yet">The map fills in once today&apos;s prices are in.</Empty>
      ) : (
        <>
          {/* Below lg the scale is not in the head: it sits right above the map, before the colours need reading. */}
          <HeatScale className="mb-2 px-2 lg:hidden" />
          <section aria-label="Heat map" className="oa-surface border border-oa-border bg-oa-card p-1 sm:p-1.5">
            {/* The wrappers carry the breakpoints: the maps' own display rules would win over a class on them. */}
            <div className="max-md:hidden">
              <HeatMapWide layout={wide} noMove={noMove} />
            </div>
            <div className="md:hidden">
              <HeatMapStack layout={phone} noMove={noMove} />
            </div>
          </section>
          <section aria-labelledby="by-sector" className="mt-8">
            <h2 id="by-sector" className="px-2 text-[17px] font-semibold text-oa-fg sm:px-0">
              How each sector moved {when}
            </h2>
            {summary.length ? <p className="mt-1 max-w-3xl text-pretty px-2 text-[14.5px] leading-6 text-oa-muted-fg sm:px-0">{summary.join(" ")}</p> : null}
            <div className="mt-3">
              <SectorCards sectors={sectors} live={live} />
            </div>
            <p className="mt-3 flex justify-end px-2 text-[13px] sm:px-0">
              <Link prefetch={false} href="/sectors" className="rounded font-medium text-oa-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oa-ring">
                Every sector over a month and a year →
              </Link>
            </p>
          </section>
        </>
      )}
    </AppPage>
  );
}
