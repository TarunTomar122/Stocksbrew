import type { Metadata } from "next";

import { ClusterRows } from "@/components/follow/insider-rows";
import { InsiderTable } from "@/components/follow/insider-table";
import { AppPage, CardGrid, PageHead, PageNote, Panel } from "@/components/oa/kit";
import { TheRead } from "@/components/oa/insight";
import { StockTallyPanel } from "@/components/follow/stock-tally";
import { buildInsiderRead } from "@/lib/follow-insights";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import {
  fmtDate,
  fmtUsd,
  getInsiderBuys,
  getInsiderSummary,
  getSectorMap,
  getInsiderTrades,
  type InsiderTrade,
} from "@/lib/follow";
import { ogImage } from "@/lib/og/url";
import Link from "next/link";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "insiders"], "Insider buying and selling from SEC Form 4", { daily: true });
  return {
    title: "Insider Buying and Selling: Latest SEC Form 4 Trades",
    description:
      "Open-market stock purchases and sales by company officers, directors and 10% owners, from SEC Form 4. Cluster buys are called out: three or more insiders buying the same stock within 30 days.",
    alternates: { canonical: "/insiders" },
    openGraph: { title: "Insider Buying and Selling: Latest SEC Form 4 Trades · stocksbrew", url: "https://www.stocksbrew.online/insiders", images: [shareImage] },
    twitter: { card: "summary_large_image", images: [shareImage] },
  };
}

export const revalidate = 600;

export default async function InsidersPage() {
  const [summary, buys, recent, sectors] = await Promise.all([
    getInsiderSummary().catch(() => ({ clusters: [], meta: null })),
    getInsiderBuys(500).catch(() => [] as InsiderTrade[]),
    getInsiderTrades(900).catch(() => [] as InsiderTrade[]),
    getSectorMap(),
  ]);
  const { clusters, meta } = summary;
  const read = buildInsiderRead({ buys, recent, sectors, today: new Date().toISOString().slice(0, 10) });
  const topBought = read.tallies.slice(0, 6);
  const byValue = [...read.tallies].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6);

  // Every buy in the window plus the most recent sales, newest filing first, without repeats.
  const byId = new Map<string, InsiderTrade>();
  for (const trade of [...buys, ...recent]) byId.set(trade.id, trade);
  const trades = [...byId.values()].sort((a, b) =>
    a.filed_at < b.filed_at ? 1 : a.filed_at > b.filed_at ? -1 : 0,
  );

  return (
    <AppPage>
      <MarketingSchema path="/insiders" name="Insider Buying and Selling: Latest SEC Form 4 Trades" description="Open-market stock purchases and sales by company officers, directors and 10% owners, from SEC Form 4." breadcrumbLabel="Insiders" parent={{ name: "Follow", path: "/follow" }} />
      <PageHead
        crumb={
          <>
            <Link prefetch={false} href="/follow?tab=insiders" className="hover:text-oa-fg">
              Follow
            </Link>{" "}
            / Insiders
          </>
        }
        title="What company insiders bought and sold"
        note={false}
      />

      <TheRead read={read} className="mb-4" />

      <CardGrid cols={2} className="mb-4">
        <StockTallyPanel
          label="Most insiders buying · 2 weeks"
          side="buy"
          unit="insider"
          rows={topBought}
          empty="No open-market insider buys in the last two weeks."
          takeaway={
            topBought[0]
              ? `${topBought[0].ticker} had the most insiders buying: ${topBought[0].buyers.length}, ${fmtUsd(topBought[0].value ?? 0)} in all.`
              : undefined
          }
        />
        <StockTallyPanel
          label="Most money in · 2 weeks"
          side="buy"
          unit="insider"
          rows={byValue}
          empty="No open-market insider buys in the last two weeks."
          takeaway={byValue[0] ? `${fmtUsd(byValue[0].value ?? 0)} of ${byValue[0].ticker} bought by insiders, the most money into any stock.` : undefined}
        />
      </CardGrid>

      <Panel
        flush
        className="mb-4"
        label={
          <>
            Cluster buys <span className="oa-mono ml-1 font-normal text-oa-muted-fg">{clusters.length}</span>
          </>
        }
        right={<span className="hidden sm:inline">Three or more insiders buying the same stock within 30 days</span>}
      >
        {clusters.length > 0 ? (
          <ClusterRows clusters={clusters.slice(0, 9)} />
        ) : (
          <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">
            {meta
              ? `No cluster buys since ${fmtDate(meta.since)}. That is normal: most insider activity is selling.`
              : "No insider filings yet."}
          </p>
        )}
      </Panel>

      <section aria-label="Recent trades">
        <InsiderTable trades={trades} initialSide="buy" />
        <p className="mt-2 max-w-[78ch] px-2 text-[12.5px] leading-5 text-oa-muted-fg sm:px-0">
          {meta ? `SEC Form 4, filed through ${fmtDate(meta.generated_at)}. ` : ""}Not investment advice.
        </p>
      </section>
      <PageNote lede="Open-market buys and sales by officers, directors and 10% owners, reported within two business days." />
    </AppPage>
  );
}
