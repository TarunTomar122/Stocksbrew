import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { closeWords } from "@/lib/benchmark-day";
import { AppPage, Delta, NUM, PageHead, Panel, SignedBar, SourceLine, barDomain, fmtCompact, fmtDay } from "@/components/oa/kit";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { SectorIcon } from "@/components/oa/sector-icon";
import { ogImage } from "@/lib/og/url";
import { sectorStats } from "@/lib/screener-shared";
import { callCounts } from "@/lib/sector-insights";
import { sectorHref } from "@/lib/seo/families";
import { getCoverage, sectorGroups } from "@/lib/seo/family-data";
import Link from "next/link";

/** Every sector we cover and how they moved. Each row opens /sectors/[slug]. */

/**
 * A return with its bar, on a scale shared by the whole column and one zero line (judges, sweep 87), so the sectors
 * compare at a glance and a loss runs left. `phone`: the bar shows on a phone too (only the year's does; the
 * others would push the table wider than the screen).
 */
function ReturnCell({ value, domain, phone = false }: { value: number | null | undefined; domain: [number, number]; phone?: boolean }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <SignedBar value={value} domain={domain} strongZero className={`w-8 shrink-0 sm:w-10 ${phone ? "" : "max-sm:hidden"}`} />
      <Delta value={value} digits={1} className="min-w-[3.25rem] text-right text-[13.5px]" />
    </span>
  );
}

/**
 * A share of the sector's stocks (rising, our Buy more call): its figure, and a 0-100% bar with a tick at the share
 * across every sector (judge90). A bar alone only said the number again (council, sweep 87); the tick gives it
 * something to hold it against, so a sector reads as above or below the market at a glance.
 */
function ShareCell({ pct, average }: { pct: number | null; average: number | null }) {
  if (pct === null) return <span className={`${NUM} text-[13.5px] text-oa-muted-fg`}>n/a</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden="true" className="relative block h-1.5 w-10 shrink-0 rounded-full bg-oa-bg max-sm:hidden">
        <span className="absolute inset-y-0 left-0 rounded-full bg-oa-muted-fg/60" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        {average !== null ? <span className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-oa-fg" style={{ left: `${Math.max(0, Math.min(100, average))}%` }} /> : null}
      </span>
      <span className={`${NUM} min-w-[2.25rem] text-right text-[13.5px]`}>{pct}%</span>
    </span>
  );
}

/** The share bars' tick, named once over the table (as the themes list names its S&P 500 tick). */
function AverageKey({ rising, buyMore }: { rising: number | null; buyMore: number | null }) {
  if (rising === null && buyMore === null) return null;
  const title = [rising !== null ? `${rising}% of all stocks rose` : null, buyMore !== null ? `${buyMore}% are Buy more` : null].filter(Boolean).join("; ");
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-oa-muted-fg max-sm:hidden" title={title}>
      <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-oa-fg" />
      All sectors
    </span>
  );
}

export const revalidate = 900;

const BASE = "https://www.stocksbrew.online";
const TITLE = "Stock Market Sectors: Performance by Sector Today, This Month and This Year";

export async function generateMetadata(): Promise<Metadata> {
  const coverage = await getCoverage();
  const count = sectorGroups(coverage).length;
  const description = `The ${count} sectors of the US stocks we cover, ranked by market value: the latest session, the last month and this year against the S&P 500, the share of stocks rising and our calls in each.`;
  const shareImage = ogImage(["page", "screener"], "US stock sectors", { daily: true });
  return {
    title: TITLE,
    description,
    alternates: { canonical: "/sectors" },
    openGraph: { title: `${TITLE} · stocksbrew`, description, url: `${BASE}/sectors`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description, images: [shareImage] },
  };
}

export default async function SectorsPage() {
  const coverage = await getCoverage();
  const stats = sectorStats(coverage.rows);
  const groups = new Map(sectorGroups(coverage).map((group) => [group.slug, group]));

  const columns: DataColumn[] = [
    { id: "sector", label: "Sector" },
    { id: "count", label: "Stocks", align: "right", hideOnMobile: true },
    { id: "day", label: "Day", align: "right" },
    { id: "m1", label: "1 month", align: "right", hideOnMobile: true },
    { id: "ytd", label: "This year", align: "right" },
    { id: "adv", label: "Rising", align: "right", hideOnMobile: true, hint: "Share of the sector's stocks that rose in the latest session; the tick is every sector's" },
    { id: "add", label: "Buy more", align: "right", hideOnMobile: true, hint: "Share of the sector's stocks where our call is Buy more; the tick is every sector's" },
    { id: "cap", label: "Market value", align: "right", hideOnMobile: true },
  ];
  // One scale per column, so each column of bars reads as one chart.
  const domains = {
    day: barDomain(stats.map((stat) => stat.change.day_pct)),
    m1: barDomain(stats.map((stat) => stat.change.ret_1m)),
    ytd: barDomain(stats.map((stat) => stat.change.ret_ytd)),
  };
  // The ticks on the Rising and Buy more bars: the same shares over every stock in every sector.
  const everyRow = [...groups.values()].flatMap((group) => group.rows);
  const dayKnown = everyRow.filter((row) => typeof row.day_pct === "number" && Number.isFinite(row.day_pct));
  const risingAll = dayKnown.length ? Math.round((dayKnown.filter((row) => (row.day_pct as number) > 0).length / dayKnown.length) * 100) : null;
  const callsAll = callCounts(everyRow);
  const buyMoreAll = callsAll.total ? Math.round((callsAll.Add / callsAll.total) * 100) : null;
  const rows: DataRow[] = stats.map((stat) => {
    const calls = callCounts(groups.get(stat.slug)?.rows ?? []);
    const addShare = calls.total ? Math.round((calls.Add / calls.total) * 100) : null;
    return {
      key: stat.slug,
      href: sectorHref(stat.slug),
      cells: [
        // A long name wraps on a phone, so the year's figure fits on screen rather than under the edge fade.
        <Link prefetch={false} key="s" href={sectorHref(stat.slug)} className="inline-flex items-center gap-2 whitespace-normal font-medium text-oa-fg hover:underline sm:whitespace-nowrap">
          <SectorIcon id={stat.name} size={16} />
          {stat.name}
        </Link>,
        <span key="n" className={`${NUM} text-[13.5px]`}>{stat.count}</span>,
        <ReturnCell key="d" value={stat.change.day_pct} domain={domains.day} />,
        <ReturnCell key="m" value={stat.change.ret_1m} domain={domains.m1} />,
        <ReturnCell key="y" value={stat.change.ret_ytd} domain={domains.ytd} phone />,
        <ShareCell key="a" pct={stat.advancing === null ? null : Math.round(stat.advancing)} average={risingAll} />,
        <ShareCell key="c" pct={addShare} average={buyMoreAll} />,
        <span key="v" className={`${NUM} text-[13.5px]`}>{fmtCompact(stat.marketCap, "$")}</span>,
      ],
      sort: [stat.name, stat.count, stat.change.day_pct ?? null, stat.change.ret_1m ?? null, stat.change.ret_ytd ?? null, stat.advancing, addShare, stat.marketCap],
    };
  });

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Sectors", path: "/sectors" }])} />
      <PageHead
        crumb={<Link prefetch={false} href="/screener">Screener</Link>}
        title="Stock market sectors"
        meta={<SourceLine source="Prices and company data" asOf={coverage.priceDay ? closeWords(coverage.priceDay, fmtDay(coverage.priceDay, true)) : undefined} />}
        actions={
          <span className="flex items-center gap-4">
            <AverageKey rising={risingAll} buyMore={buyMoreAll} />
            <Link prefetch={false} href="/screener?tab=sectors" className="text-[13px] font-medium text-oa-primary hover:underline">
              Heat map →
            </Link>
          </span>
        }
        note={false}
      />
      {/* Eleven sectors is a short list: every row shows, with no inner scroll box (judge89). */}
      <Panel flush>
        <DataTable columns={columns} rows={rows} initialSort={{ id: "cap", dir: "desc" }} stickyHeader={false} compact maxRows={0} />
      </Panel>
    </AppPage>
  );
}
