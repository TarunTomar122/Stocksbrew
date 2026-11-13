import { noteDegradedRender } from "@/lib/next-render";
import type { Metadata } from "next";

import { ClusterRows } from "@/components/follow/insider-rows";
import { InsiderTable } from "@/components/follow/insider-table";
import { AppPage, CardGrid, PageHead, Panel } from "@/components/oa/kit";
import { StockTallyPanel } from "@/components/follow/stock-tally";
import { buildInsiderRead } from "@/lib/follow-insights";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import {
  fmtUsd,
  getInsiderBuys,
  getInsiderSummary,
  getSectorMap,
  getInsiderTrades,
  insiderTradeRow,
  type InsiderTrade,
} from "@/lib/follow";
import { INSIDER_BUY_ROWS, INSIDER_TRADE_ROWS, nyDay } from "@/lib/insider-balance";
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

/** The table carries the newest sales only; every row it holds goes to the browser, slimmed to what a row shows. */
const TABLE_RECENT_ROWS = 900;

export default async function InsidersPage() {
  const [summary, buys, recent, sectors] = await Promise.all([
    getInsiderSummary().catch(() => (noteDegradedRender(), { clusters: [], meta: null })),
    getInsiderBuys(INSIDER_BUY_ROWS).catch(() => (noteDegradedRender(), [] as InsiderTrade[])),
    // The same rows /filings reads, so the dollar balance both pages quote is one number.
    getInsiderTrades(INSIDER_TRADE_ROWS).catch(() => (noteDegradedRender(), [] as InsiderTrade[])),
    getSectorMap(),
  ]);
  const { clusters } = summary;
  const now = Date.now();
  // Each stock's buyers and money in over the window (the tallies behind the two lists below).
  const { tallies } = buildInsiderRead({ buys, recent, sectors, today: nyDay(now), now, recentLimit: INSIDER_TRADE_ROWS });
  const topBought = tallies.slice(0, 6);
  // The money list leaves out the stocks already in the buyers list, so no stock is listed twice side by side
  // (owner rule 1). Neither list has a sentence over it: it only said the first row again (rule 8).
  const ranked = [...tallies].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const inBought = new Set(topBought.map((row) => row.ticker));
  const byValue = ranked.filter((row) => !inBought.has(row.ticker)).slice(0, 6);

  // Every buy in the window plus the most recent sales, newest filing first, without repeats.
  const byId = new Map<string, InsiderTrade>();
  for (const trade of [...buys, ...recent.slice(0, TABLE_RECENT_ROWS)]) byId.set(trade.id, trade);
  // Slim rows: every trade goes to the browser for the scrolling table, so each carries only what a row shows.
  const trades = [...byId.values()]
    .sort((a, b) => (a.filed_at < b.filed_at ? 1 : a.filed_at > b.filed_at ? -1 : 0))
    .map(insiderTradeRow);

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

      {/* The money list only when it has stocks of its own; then the buyers list fills the row alone (owner rule 4). */}
      <CardGrid cols={2} className={`mb-4 ${byValue.length ? "" : "md:!grid-cols-1"}`}>
        <StockTallyPanel
          label="Most insiders buying · 2 weeks"
          side="buy"
          unit="insider"
          rows={topBought}
          empty="No open-market insider buys in the last two weeks."
        />
        {byValue.length ? (
        <StockTallyPanel
          label="Most money in · 2 weeks"
          side="buy"
          unit="insider"
          figure={(row) => fmtUsd(row.value ?? 0)}
          measure={(row) => row.value ?? 0}
          rows={byValue}
          empty="No open-market insider buys in the last two weeks."
        />
        ) : null}
      </CardGrid>

      {/* Only when there is one: a card that can only say "no cluster buys" is not shown (owner rule 4). */}
      {clusters.length > 0 ? (
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
          <ClusterRows clusters={clusters} />
        </Panel>
      ) : null}

      <section aria-label="Recent trades">
        {/* No Form 4 footnote (owner rule 8): each filing time opens its Form 4, and the site footer says it is not advice. */}
        <InsiderTable trades={trades} initialSide="buy" today={nyDay(now)} />
      </section>
    </AppPage>
  );
}
