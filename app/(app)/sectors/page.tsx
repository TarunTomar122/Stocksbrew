import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, Delta, NUM, PageHead, Panel, SourceLine, fmtCompact, fmtDay } from "@/components/oa/kit";
import { DataTable, type DataColumn, type DataRow } from "@/components/oa/kit/data-table";
import { ogImage } from "@/lib/og/url";
import { buildSectorsRead } from "@/lib/screener-insights";
import { sectorStats } from "@/lib/screener-shared";
import { callCounts } from "@/lib/sector-insights";
import { sectorHref } from "@/lib/seo/families";
import { getCoverage, sectorGroups } from "@/lib/seo/family-data";

/** Every sector we cover, with the read on how they moved. Each row opens /sectors/[slug]. */

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
  const read = buildSectorsRead({ stats, priceDay: coverage.priceDay, asOf: coverage.generatedAt });
  // The sectors read links its insights to the screener; the sector pages are the better landing now.
  const sectorRead = read
    ? {
        ...read,
        insights: read.insights.map((insight) =>
          insight.action?.href.startsWith("/screener?sector=")
            ? { ...insight, action: { label: insight.action.label.replace(/^Screen /, "Open "), href: sectorHref(insight.action.href.slice("/screener?sector=".length)) } }
            : insight,
        ),
      }
    : null;

  const columns: DataColumn[] = [
    { id: "sector", label: "Sector" },
    { id: "count", label: "Stocks", align: "right", hideOnMobile: true },
    { id: "day", label: "Day", align: "right" },
    { id: "m1", label: "1 month", align: "right", hideOnMobile: true },
    { id: "ytd", label: "This year", align: "right" },
    { id: "adv", label: "Rising", align: "right", hideOnMobile: true, hint: "Share of the sector's stocks that rose in the latest session" },
    { id: "add", label: "Add calls", align: "right", hideOnMobile: true, hint: "Share of the sector's stocks where our call is Add" },
    { id: "cap", label: "Market value", align: "right", hideOnMobile: true },
  ];
  const rows: DataRow[] = stats.map((stat) => {
    const calls = callCounts(groups.get(stat.slug)?.rows ?? []);
    const addShare = calls.total ? Math.round((calls.Add / calls.total) * 100) : null;
    return {
      key: stat.slug,
      href: sectorHref(stat.slug),
      cells: [
        <a key="s" href={sectorHref(stat.slug)} className="font-medium text-oa-fg hover:underline">
          {stat.name}
        </a>,
        <span key="n" className={`${NUM} text-[13.5px]`}>{stat.count}</span>,
        <Delta key="d" value={stat.change.day_pct} digits={1} className="text-[13.5px]" />,
        <Delta key="m" value={stat.change.ret_1m} digits={1} className="text-[13.5px]" />,
        <Delta key="y" value={stat.change.ret_ytd} digits={1} className="text-[13.5px]" />,
        <span key="a" className={`${NUM} text-[13.5px]`}>{stat.advancing === null ? "n/a" : `${Math.round(stat.advancing)}%`}</span>,
        <span key="c" className={`${NUM} text-[13.5px]`}>{addShare === null ? "n/a" : `${addShare}%`}</span>,
        <span key="v" className={`${NUM} text-[13.5px]`}>{fmtCompact(stat.marketCap, "$")}</span>,
      ],
      sort: [stat.name, stat.count, stat.change.day_pct ?? null, stat.change.ret_1m ?? null, stat.change.ret_ytd ?? null, stat.advancing, addShare, stat.marketCap],
    };
  });

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Sectors", path: "/sectors" }])} />
      <PageHead
        crumb={<a href="/screener">Screener</a>}
        title="Stock market sectors"
        meta={<SourceLine source="Prices and company data" asOf={coverage.priceDay ? `the ${fmtDay(coverage.priceDay, true)} close` : undefined} />}
        actions={
          <a href="/screener?tab=sectors" className="text-[13px] font-medium text-oa-primary hover:underline">
            Heat map →
          </a>
        }
        note={false}
      />
      <TheRead read={sectorRead} label="Sectors, in short" className="mb-4" />
      <Panel flush>
        <DataTable columns={columns} rows={rows} initialSort={{ id: "cap", dir: "desc" }} stickyHeader={false} />
      </Panel>
    </AppPage>
  );
}
